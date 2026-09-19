## Refer to these docs:

https://elevenlabs.io/docs/eleven-agents/guides/quickstarts/next-js
GPTZero docs: ./docs_gpt_zero.json

## API Keys:

These are already inside .env

GPT_ZERO_API_KEY=
11LABS_API_KEY=

## Aim

Aim or project is to build a live AI speech detector.
Record someone speaking. Run STT with 11labs.
If we get 70 words or more or transcript is paused, no more words are getting in, send to GPTZero for processing.
Get the score or probability.
If its AI - interrupt the person, and casually curse like: Hey!! (loud voice), you sloppy bitch, you're using AI. and multiple things like that!
if its human. commend in normal voice, good good keep it up.
if its mixed. give a little commend but say its still sounds like AI, come back again with better job.

frontend would be next.js. we would have video/mic on left. if its video, then show video too, audio is gonna be there anyways. allow to change video/audio sources. big circle buttons. on the right, black bg. in big transcript is going on. gptzero's outputs would highlight sentences, give game like popups, show ai/human/mixed. show confidence as well.

i will open 11ty sound on different tab so it doesnt conflict with voice recording. it is not gonna speak entire time or after every chunk, just after one chunk. i will change later if i like.

Different personas (different voice for 11labs and frontend feel.) shown as cards.

- Prepare Pitch: get ranked, get advice.
- Interview detection.

Once mic/record is on, it starts detecting. the mic should stop recording, once 11ty is speaking. 11ty would say shhhhhh, like stop the user from saying further.

<!-- Don't limit to the features I am requesting, also suggest what more we can add, once we have an MVP. -->

## Design

use /apple-design skill for designing.
you can use /pick-ui-library for finding libraries
use /mobile-native to make it responsive for mobile
