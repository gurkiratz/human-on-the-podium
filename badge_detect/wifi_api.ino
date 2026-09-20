// ESP32-C3 badge - joins an existing WiFi network, 6 LED modes, AI score + IP on LCD, HTTP API
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <SPI.h>
#include <Adafruit_NeoPixel.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

#define LED_PIN   3
#define LED_COUNT 6

// LCD pins (ST7789, 320x240, SPI)
#define LCD_MOSI 10
#define LCD_CLK  1
#define LCD_CS   2
#define LCD_DC   0
#define LCD_RST  4

// Fill these in. Must be a 2.4 GHz network (the ESP32-C3 has no 5 GHz).
#define WIFI_SSID "Joshua"
#define WIFI_PASS "jeffjones"

Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
Adafruit_ST7789 tft(&SPI, LCD_CS, LCD_DC, LCD_RST);
WebServer server(80);

enum Mode { MODE_OFF, MODE_YELLOW, MODE_GREEN, MODE_RED, MODE_FLASH_RED, MODE_FLASH_GREEN };
Mode currentMode = MODE_OFF;

// AI score (0-100). Defaults to 87 at boot; set it over the API (POST /api/score).
// A score of -1 means "still analyzing": the screen shows "Analyzing" instead of a percentage.
int aiScore = -1;

uint32_t lastColor = 0xFFFFFFFF;

// Legacy names (used by the web page and /mode)
const char* modeName(Mode m) {
  switch (m) {
    case MODE_YELLOW:      return "yellow";
    case MODE_GREEN:       return "green";
    case MODE_RED:         return "red";
    case MODE_FLASH_RED:   return "flash";
    case MODE_FLASH_GREEN: return "flashgreen";
    default:               return "off";
  }
}

// Names used by the JSON API
const char* stateName(Mode m) {
  switch (m) {
    case MODE_YELLOW:      return "yellow";
    case MODE_GREEN:       return "green";
    case MODE_RED:         return "red";
    case MODE_FLASH_RED:   return "flash_red";
    case MODE_FLASH_GREEN: return "flash_green";
    default:               return "off";
  }
}

void showColor(uint32_t c) {
  if (c == lastColor) return;
  lastColor = c;
  strip.fill(c);
  strip.show();
}

// ---------- LCD ----------

// Draw text horizontally centered at vertical position y
void drawCentered(const String& text, int y, uint8_t size, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.setTextSize(size);
  tft.setTextColor(color);
  tft.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  tft.setCursor((tft.width() - (int)w) / 2, y);
  tft.print(text);
}

// Layout: title on top, "NN% AI" in the middle (or "Analyzing" when the score is -1),
// small IP at the bottom.
// Score is red at 50 and above, green below 50.
// Redraws only when the IP or score has changed.
void updateDisplay(bool force = false) {
  static String lastIp = "";
  static int lastScore = -2;   // -2 = nothing drawn yet (-1 is a real value: "Analyzing")

  String ip = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : String("---");

  if (!force && ip == lastIp && aiScore == lastScore) return;
  lastIp = ip;
  lastScore = aiScore;

  tft.fillScreen(ST77XX_BLACK);
  drawCentered("AI-Badge", 20, 3, ST77XX_WHITE);                    // top

  if (aiScore == -1) {
    drawCentered("Analyzing", 98, 5, ST77XX_YELLOW);                // middle (still analyzing)
  } else {
    uint16_t scoreColor = (aiScore >= 50) ? ST77XX_RED : ST77XX_GREEN;
    drawCentered(String(aiScore) + "% AI", 90, 7, scoreColor);      // middle (big)
  }

  drawCentered(ip, 205, 2, ST77XX_CYAN);                            // bottom (small)
}

void initDisplay() {
  SPI.begin(LCD_CLK, -1, LCD_MOSI, LCD_CS);  // SCK, MISO (unused), MOSI, SS
  tft.init(240, 320);                         // native panel size (portrait)
  tft.setSPISpeed(40000000);
  tft.setRotation(3);                         // landscape, flipped 180 deg (use 1 for the other way up)
  tft.fillScreen(ST77XX_BLACK);
}

// ---------- Parsing helpers ----------

// Accepts: yellow, green, red, off, flash_red, flash_green (case-insensitive, "-" or " " = "_"),
// plus the legacy names "flash" (= flash_red) and "flashgreen" (= flash_green).
bool parseMode(String s, Mode& out) {
  s.trim();
  s.toLowerCase();
  s.replace('-', '_');
  s.replace(' ', '_');

  if      (s == "yellow")                                  out = MODE_YELLOW;
  else if (s == "green")                                   out = MODE_GREEN;
  else if (s == "red")                                     out = MODE_RED;
  else if (s == "flash" || s == "flash_red" || s == "flashred")       out = MODE_FLASH_RED;
  else if (s == "flashgreen" || s == "flash_green")        out = MODE_FLASH_GREEN;
  else if (s == "off")                                     out = MODE_OFF;
  else return false;
  return true;
}

// Accepts a number 0-100 (decimals are rounded to the nearest whole number),
// or exactly -1, which means "Analyzing"
bool parseScore(String s, int& out) {
  s.trim();
  if (s == "-1") { out = -1; return true; }
  if (s.length() == 0 || s.length() > 6 || s == ".") return false;
  int dots = 0;
  for (unsigned i = 0; i < s.length(); i++) {
    char c = s.charAt(i);
    if (c == '.') { if (++dots > 1) return false; }
    else if (!isDigit(c)) return false;
  }
  float f = s.toFloat();
  if (f < 0 || f > 100) return false;
  out = (int)(f + 0.5f);
  return true;
}

// Very small JSON field reader: finds "key": value in a flat JSON body and returns the value as text
String jsonField(const String& body, const char* key) {
  String needle = String("\"") + key + "\"";
  int k = body.indexOf(needle);
  if (k < 0) return "";
  int c = body.indexOf(':', k + needle.length());
  if (c < 0) return "";
  int i = c + 1;
  int n = body.length();
  while (i < n && (body[i] == ' ' || body[i] == '\t' || body[i] == '\r' || body[i] == '\n' || body[i] == '"')) i++;
  int j = i;
  while (j < n && body[j] != '"' && body[j] != ',' && body[j] != '}' &&
         body[j] != ' ' && body[j] != '\r' && body[j] != '\n') j++;
  return body.substring(i, j);
}

// Reads a value from the query string / form body, or from a JSON body
String getParam(const char* key) {
  if (server.hasArg(key)) return server.arg(key);
  if (server.hasArg("plain")) return jsonField(server.arg("plain"), key);
  return "";
}

void sendJson(int code, const String& body) {
  server.send(code, "application/json", body);
}

String errorJson(const char* msg) {
  return String("{\"ok\":false,\"error\":\"") + msg + "\"}";
}

// ---------- JSON API ----------

// GET /api/status -> {"ok":true,"led":"red","score":87,"ip":"1.2.3.4","uptime_s":123}
void handleApiStatus() {
  String ip = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : String("");
  String j = String("{\"ok\":true,\"led\":\"") + stateName(currentMode) +
             "\",\"score\":" + String(aiScore) +
             ",\"ip\":\"" + ip +
             "\",\"uptime_s\":" + String(millis() / 1000) + "}";
  sendJson(200, j);
}

// GET  /api/led                 -> read current state
// POST /api/led  {"state":"flash_red"}  (or ?state=flash_red) -> set state
void handleApiLed() {
  String s = getParam("state");

  if (s.length() == 0) {
    if (server.method() == HTTP_GET) {
      sendJson(200, String("{\"ok\":true,\"led\":\"") + stateName(currentMode) + "\"}");
    } else {
      sendJson(400, errorJson("Missing state. Use off, yellow, green, red, flash_red or flash_green."));
    }
    return;
  }

  Mode m;
  if (!parseMode(s, m)) {
    sendJson(400, errorJson("Unknown state. Use off, yellow, green, red, flash_red or flash_green."));
    return;
  }

  currentMode = m;
  Serial.printf("API LED = %s\n", stateName(currentMode));
  sendJson(200, String("{\"ok\":true,\"led\":\"") + stateName(currentMode) + "\"}");
}

// GET  /api/score               -> read current score
// POST /api/score {"score":87}  (or ?score=87) -> set score (0-100, or -1 = show "Analyzing")
void handleApiScore() {
  String s = getParam("score");

  if (s.length() == 0) {
    if (server.method() == HTTP_GET) {
      sendJson(200, String("{\"ok\":true,\"score\":") + String(aiScore) + "}");
    } else {
      sendJson(400, errorJson("Missing score. Send a number from 0 to 100, or -1 for Analyzing."));
    }
    return;
  }

  int v;
  if (!parseScore(s, v)) {
    sendJson(400, errorJson("Score must be a number from 0 to 100, or -1 for Analyzing."));
    return;
  }

  aiScore = v;
  updateDisplay();   // refresh the screen right away
  Serial.printf("API SCORE = %d\n", aiScore);
  sendJson(200, String("{\"ok\":true,\"score\":") + String(aiScore) + "}");
}

// ---------- Web page + legacy endpoints ----------

// GET /  -> control page with 6 buttons
void handleRoot() {
  server.send(200, "text/html",
    "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>AI-Badge</title>"
    "<style>"
    "body{font-family:sans-serif;text-align:center;padding:24px}"
    "button{display:block;width:100%;max-width:360px;margin:14px auto;padding:26px 0;"
    "font-size:26px;font-weight:bold;border:none;border-radius:14px;color:#fff}"
    "#y{background:#e6a800;color:#000}#g{background:#1e9e3e}#r{background:#d32020}"
    "#f{background:#d32020;border:6px dashed #fff;outline:3px solid #d32020}"
    "#fg{background:#1e9e3e;border:6px dashed #fff;outline:3px solid #1e9e3e}"
    "#o{background:#444}"
    "</style></head><body>"
    "<h1>AI-Badge</h1>"
    "<button id='y' onclick=\"send('yellow')\">YELLOW</button>"
    "<button id='g' onclick=\"send('green')\">GREEN</button>"
    "<button id='r' onclick=\"send('red')\">RED</button>"
    "<button id='f' onclick=\"send('flash')\">FLASHING RED</button>"
    "<button id='fg' onclick=\"send('flashgreen')\">FLASHING GREEN</button>"
    "<button id='o' onclick=\"send('off')\">OFF</button>"
    "<p id='s'></p>"
    "<script>"
    "function send(m){fetch('/mode?m='+m).then(r=>r.text()).then(t=>{document.getElementById('s').innerText=t})"
    ".catch(e=>{document.getElementById('s').innerText='Error: '+e})}"
    "</script></body></html>");
}

// GET or POST /mode?m=yellow|green|red|flash|flashgreen|off   (used by the web page)
void handleMode() {
  String m;
  if (server.hasArg("m")) m = server.arg("m");
  else if (server.hasArg("plain")) m = server.arg("plain");

  Mode parsed;
  if (!parseMode(m, parsed)) {
    server.send(400, "text/plain", "Unknown mode. Use yellow, green, red, flash, flashgreen or off.");
    return;
  }

  currentMode = parsed;
  Serial.printf("MODE = %s\n", modeName(currentMode));
  server.send(200, "text/plain", String("OK MODE=") + modeName(currentMode));
}

// GET /status
void handleStatus() {
  server.send(200, "text/plain", String("MODE=") + modeName(currentMode));
}

// ---------- WiFi ----------

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.printf("Connecting to \"%s\"", WIFI_SSID);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Joined WiFi. Badge IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi join FAILED (will keep retrying in loop)");
  }
}

void setup() {
  Serial.begin(115200);
  Serial.setTxTimeoutMs(0);
  delay(2000);
  Serial.println("Badge WiFi sketch starting");

  strip.begin();
  strip.setBrightness(60);
  strip.clear();
  strip.show();

  initDisplay();
  updateDisplay(true);   // shows title + score right away, IP as "---" while we join WiFi

  connectWifi();
  updateDisplay();       // shows the IP once connected

  if (MDNS.begin("badge")) {
    MDNS.addService("http", "tcp", 80);
    Serial.println("mDNS: http://badge.local/ (may not work on all phones)");
  }

  // Web page + legacy endpoints
  server.on("/", handleRoot);
  server.on("/mode", handleMode);
  server.on("/status", handleStatus);

  // JSON API
  server.on("/api/status", handleApiStatus);
  server.on("/api/led", handleApiLed);
  server.on("/api/score", handleApiScore);
  server.onNotFound([]() { sendJson(404, errorJson("Not found")); });

  server.begin();
  Serial.println("HTTP server started on port 80");

  // Brief white flash so you know the badge finished booting
  showColor(strip.Color(80, 80, 80));
  delay(500);
  showColor(0);
}

void loop() {
  server.handleClient();

  uint32_t now = millis();

  // Retry the connection every 10 s if we've lost WiFi
  static uint32_t lastRetry = 0;
  if (WiFi.status() != WL_CONNECTED && now - lastRetry >= 10000) {
    lastRetry = now;
    Serial.println("WiFi lost, reconnecting...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }

  // Keep the LCD in sync with IP/score (checked twice a second, redraws only on change)
  static uint32_t lastDisplay = 0;
  if (now - lastDisplay >= 500) {
    lastDisplay = now;
    updateDisplay();
  }

  switch (currentMode) {
    case MODE_YELLOW:      showColor(strip.Color(255, 170, 0)); break;  // tuned so it reads as yellow, not lime
    case MODE_GREEN:       showColor(strip.Color(0, 255, 0));   break;
    case MODE_RED:         showColor(strip.Color(255, 0, 0));   break;
    case MODE_FLASH_RED:   showColor(((now / 250) % 2 == 0) ? strip.Color(255, 0, 0) : 0); break;
    case MODE_FLASH_GREEN: showColor(((now / 250) % 2 == 0) ? strip.Color(0, 255, 0) : 0); break;
    default:               showColor(0);                        break;
  }

  static uint32_t lastAlive = 0;
  if (now - lastAlive >= 5000) {
    lastAlive = now;
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("alive, wifi=1, mode=");
      Serial.print(modeName(currentMode));
      Serial.print(", IP ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("alive, wifi=0");
    }
  }
}