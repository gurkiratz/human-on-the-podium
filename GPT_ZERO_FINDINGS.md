# GPTZero API Test Report

## 1. About This Document

This document gives the results of the tests on the GPTZero API. The tests
answer these questions:

- Does the API key work?
- Does the API give a probability?
- How much text must you send to get a correct result?
- How fast is the API?
- Does the API show the result for the full text, or for each sentence?

This document uses ASD-STE100 Simplified Technical English. It keeps one
meaning for each word, the active voice, and simple verb tenses. It does not
keep the STE limit on sentence length, because the reader asked for sentences
of usual length.

Test date: 2026-09-19.

## 2. Terms

| Term | Definition in this document |
|---|---|
| chunk | The text that you send to the API in one request. |
| window | The last N words of the transcript that you put in a chunk. |
| step | The number of new words that you receive before you send the next chunk. |
| probability | A number from 0.000 to 1.000 that shows how much the text looks like AI text. |
| document level | The result for the full chunk. |
| sentence level | The result for one sentence in the chunk. |

## 3. Summary

The API key works. The API gives a probability at the document level and at
the sentence level. The API is fast enough for real-time use. The API shows
which sentences are AI text, but it does not show which words are AI text.

You must send at least 70 words of conversational text to get a correct
result. This is the most important limit for your audio transcription task.

## 4. The API Key

The key works. The account data is:

- Plan: Premium (Annual)
- Words before the tests: 286162
- Words after the tests: 246428

CAUTION: The tests used about 39700 words. The account meters the words that
you send, not the words that you receive. A window that moves sends the same
word many times. Multiply your word count by the overlap factor when you
calculate the cost.

NOTE: The API blocks the default Python user agent with a Cloudflare 403
error. Set the `User-Agent` header to a usual browser or curl value.

## 5. Probability Results

The API gives a probability. The file `sample.txt` gave this result:

- Predicted class: `ai`
- Probability: 1.000
- Confidence: `high`

The API gives these fields at the document level:

- `predicted_class` — one of `ai`, `human`, or `mixed`
- `class_probabilities` — the probability for each class
- `confidence_category` — one of `high`, `medium`, or `low`
- `completely_generated_prob`

CAUTION: The document-level probabilities go directly to 1.000 or 0.000. They
do not give a range of values between 0.000 and 1.000. Use the sentence-level
probabilities if you must have values between these two numbers, because the
sentence-level probabilities give values such as 0.97 and 0.79.

## 6. Minimum Chunk Size

The test sent 5 to 200 words of each text. The results show the word count at
which the API first gives the class `ai`:

| Text | Words necessary |
|---|---|
| Formal AI essay | 15 |
| Casual AI text, transcript style | 25 to 30 |
| `sample.txt`, casual AI text | 66 |
| Human text from 1813 and 1895 | The API never gave the class `ai` |

The change is sharp. For `sample.txt`, the probability was 0.06 at 60 words
and 1.00 at 68 words.

The errors go in one direction only. A short chunk of AI text can give the
class `human`, but a short chunk of human text does not give the class `ai`.
The human texts kept the value 0.000 at each length, and also at 5 words.
Because of this, a short chunk causes a missed detection. A short chunk does
not cause an incorrect report of AI text.

The necessary word count increases when the text becomes more casual. Speech
is very casual. Because of this, use the high values from the table.

**Send 70 words as a minimum. Send 80 words if you can. Text of less than 25
words gives no useful result.**

## 7. Speed

The speed does not change when the chunk size changes:

| Chunk size | Median time |
|---|---|
| 50 words | 0.61 s |
| 150 words | 0.62 s |
| 400 words | 0.59 s |
| 1000 words | 0.68 s |
| 49000 characters | 1.75 s |

The network causes the delay. The length of the text does not cause the delay.

NOTE: A large chunk costs almost no more time than a small chunk. Do not use
small chunks to get more speed, because you get no more speed and you lose
accuracy.

## 8. Many Requests At The Same Time

The API accepted 16 requests at the same time. The API did not limit the rate:

| Requests at the same time | Requests each second |
|---|---|
| 1 | 1.48 |
| 4 | 5.36 |
| 8 | 10.75 |
| 16 | 17.11 |

## 9. Results For Each Sentence

The API shows which sentences are AI text. The test sent a mixed chunk with
this structure:

1. 90 words of human text
2. 80 words of AI text
3. 90 words of human text

The API gave the class `mixed` at the document level. At the sentence level,
the API gave a high probability to sentences 9 to 13. These sentences are
exactly the AI part. The API gave a low probability to each other sentence.

The API also gives two sub-classes of the class `mixed`:

- `concatenated` — a person put AI text into human text
- `polished` — an AI tool rewrote human text

CAUTION: The field `highlight_sentence_for_ai` was `False` for each sentence
in the mixed chunk, and also for the AI sentences. Do not use this field. Use
your own limit on `sentences[].class_probabilities.ai`.

CAUTION: The paragraph-level results use the line breaks in the text. The
mixed chunk had no line breaks. Because of this, the API put all 23
sentences into one paragraph and gave that paragraph the value 0.000. A
transcript usually has no line breaks. Use the sentence level. Do not use the
paragraph level.

## 10. Results For Each Word

The API does not give results for each word. The smallest part of the text
with a result is the sentence.

Your key can use the endpoint `/v3/ai/patterns/stream`. This endpoint is not
available to all keys. It sends Server-Sent Events. Each event gives:

- the sentence
- the name of each AI pattern in the sentence, such as "Rule of three"
- an explanation in usual language
- the field `k_times`, which shows how much more often the pattern is in AI
  text than in human text

The events do not give character positions. The explanation quotes some words,
but the quotation is text in a sentence. To highlight those words, you must
find them in the sentence yourself. This method is good to show a reason to a
user. This method is not reliable to highlight the correct positions.

## 11. Real-Time Test

The test made a transcript with this structure: human speech, then AI text,
then human speech. The test then moved a window along the transcript.

Both configurations gave a correct result for each window:

| Window | Step | Result |
|---|---|---|
| 60 words | 30 words | Correct for each window |
| 120 words | 60 words | Correct for each window |

The script `scripts/realtime_detector.py` does this task. It keeps the
words, it sends a chunk on a different thread, and it shows the sentences
above your limit. In the test, the script found the AI text about 2
steps after the AI text started. The script then gave the class `human` again
after the AI text stopped.

## 12. Recommended Settings

| Setting | Value |
|---|---|
| Window | 80 words |
| Step | 40 words |
| Limit on the AI probability | 0.65 at the sentence level |
| Requests at the same time | 16 or less |

## 13. Limits Of The API

- The text must have 1 to 50000 characters.
- Text of 0 characters gives the error 400.
- Text of 50001 characters gives the error 400.
- The endpoint `/v3/ai/patterns/stream` accepts 150000 characters.

## 14. Cautions About These Tests

CAUTION: The first human test text was not human text. The author of this
document wrote it, and the author is an AI. GPTZero gave that text the class
`ai`, and that result was correct. The tests then used text from 1813 and 1895,
because that text is from a time before AI writing tools.

CAUTION: The text from 1813 and 1895 is not modern speech. The tests did not
use a real transcript. A real transcript has broken words, repeated words, and
errors from the speech-to-text tool. These conditions can change the minimum
word count. Do the test in Section 6 again with your own transcripts before
you use these results.

## 15. Files

| File | Contents |
|---|---|
| `scripts/gz.py` | The client for the API |
| `scripts/min_chunk.py` | The first test of the chunk size |
| `scripts/min_chunk2.py` | The test of the chunk size with human text |
| `scripts/crossover.py` | The test that finds the necessary word count |
| `scripts/latency.py` | The test of the speed |
| `scripts/concurrency.py` | The test of many requests at the same time |
| `scripts/mixed.py` | The test of the mixed chunk |
| `scripts/realtime.py` | The test of the window |
| `scripts/realtime_detector.py` | The detector for a live transcript |
| `corpus/` | The test texts |
| `results_*.json` | The data from the tests |
