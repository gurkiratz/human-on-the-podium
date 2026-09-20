"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DeviceOption = { deviceId: string; label: string };

/**
 * Device labels are hidden until the page has been granted media permission
 * at least once, so the list is re-read after every successful capture.
 */
export function useDevices() {
  const [mics, setMics] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [cameraId, setCameraId] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const toOption = (d: MediaDeviceInfo, i: number): DeviceOption => ({
      deviceId: d.deviceId,
      label:
        d.label || `${d.kind === "audioinput" ? "Microphone" : "Camera"} ${i + 1}`,
    });
    const nextMics = devices.filter((d) => d.kind === "audioinput").map(toOption);
    const nextCameras = devices.filter((d) => d.kind === "videoinput").map(toOption);
    setMics(nextMics);
    setCameras(nextCameras);
    // Keep the current selection whenever the device is still present. A
    // `devicechange` fires whenever audio hardware shuffles — which happens
    // every time the roast voice plays through a headset — and re-picking a
    // camera there would tear down a working preview for no reason.
    setMicId((current) =>
      current && nextMics.some((m) => m.deviceId === current)
        ? current
        : (nextMics[0]?.deviceId ?? ""),
    );
    setCameraId((current) =>
      current && nextCameras.some((c) => c.deviceId === current)
        ? current
        : (nextCameras[0]?.deviceId ?? ""),
    );
  }, []);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media) return;
    media.addEventListener("devicechange", refresh);
    // The initial read resolves off a promise, so state lands after the
    // effect has run rather than cascading a render inside it.
    let cancelled = false;
    void media
      .enumerateDevices()
      .then(() => {
        if (!cancelled) return refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      media.removeEventListener("devicechange", refresh);
    };
  }, [refresh]);

  return { mics, cameras, micId, setMicId, cameraId, setCameraId, refresh };
}

export type CameraState = {
  stream: MediaStream | null;
  error: string | null;
  /** True when the browser refused because no user gesture had happened yet. */
  needsGesture: boolean;
  /**
   * Opens the camera from a click (or other user gesture). Prefer this over
   * waiting for the effect — browsers often deny effect-driven getUserMedia
   * until some other media call (e.g. mic record) has already unlocked permission.
   */
  open: () => Promise<boolean>;
};

/**
 * Keeps a camera preview stream in sync with the selected device.
 *
 * Safari (and Chrome under some policies) refuse `getUserMedia` that is not
 * driven by a user gesture, so a refusal is reported back as `needsGesture`
 * and the caller should call `open()` from a click rather than only relying
 * on the effect below.
 */
export function useCamera(enabled: boolean, deviceId: string): CameraState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const deviceIdRef = useRef(deviceId);
  const enabledRef = useRef(enabled);
  const genRef = useRef(0);
  /** When true, the enabled-effect skips acquire — `open()` already owns it. */
  const skipEffectAcquireRef = useRef(false);

  deviceIdRef.current = deviceId;
  enabledRef.current = enabled;

  const replaceStream = useCallback((next: MediaStream | null) => {
    if (streamRef.current && streamRef.current !== next) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = next;
    setStream(next);
  }, []);

  const acquire = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera unavailable");
      setNeedsGesture(false);
      replaceStream(null);
      return false;
    }

    const gen = ++genRef.current;
    const id = deviceIdRef.current;

    try {
      const next = await navigator.mediaDevices.getUserMedia({
        // `ideal` avoids OverconstrainedError when the listed device id is
        // stale or empty before permissions unlock real labels.
        video: id ? { deviceId: { ideal: id } } : true,
        audio: false,
      });
      // Newer request won, or the user turned the camera off mid-prompt.
      if (gen !== genRef.current || !enabledRef.current) {
        next.getTracks().forEach((t) => t.stop());
        return false;
      }
      replaceStream(next);
      setError(null);
      setNeedsGesture(false);
      return true;
    } catch (err: unknown) {
      if (gen !== genRef.current) return false;
      const name = err instanceof DOMException ? err.name : "";
      setNeedsGesture(name === "NotAllowedError" || name === "SecurityError");
      setError(err instanceof Error ? err.message : "Camera unavailable");
      replaceStream(null);
      return false;
    }
  }, [replaceStream]);

  const open = useCallback(async (): Promise<boolean> => {
    // Claim the next enabled-effect so it does not start a second getUserMedia
    // that would invalidate this gesture-backed request.
    skipEffectAcquireRef.current = true;
    enabledRef.current = true;
    return acquire();
  }, [acquire]);

  useEffect(() => {
    if (!enabled) {
      genRef.current += 1;
      skipEffectAcquireRef.current = false;
      replaceStream(null);
      setError(null);
      setNeedsGesture(false);
      return;
    }

    if (skipEffectAcquireRef.current) {
      skipEffectAcquireRef.current = false;
      return;
    }

    void acquire();
  }, [enabled, acquire, replaceStream]);

  // Switch the live preview when the user picks a different camera.
  useEffect(() => {
    if (!enabled || !streamRef.current) return;
    void acquire();
  }, [deviceId, enabled, acquire]);

  useEffect(() => {
    return () => {
      genRef.current += 1;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return {
    stream: enabled ? stream : null,
    error: enabled ? error : null,
    needsGesture: enabled ? needsGesture : false,
    open,
  };
}
