# The Chupke demo video

Published at https://youtu.be/UON-xeeoFoY.

A 91-second demo for the Free Society Hack:
- **Scenes:** coded in Remotion.
- **Voiceover:** ElevenLabs (voice "Aditya – Expressive & Natural Narrator", model `eleven_v4`).
- **Sound effects:** ElevenLabs. Most are reused from the Favor Loop video; the stamp is new.
- **Soundtrack:** synthesized in Python from the same timeline, so the drop and the final hit land on the cut.
- **Screen footage:** recorded from the live site, https://chupke-production.up.railway.app.

| Path | What |
|---|---|
| `src/timeline.json` | The one clock: scene windows, voice line starts and lengths, caption chunks (`tools/timeline.py`) |
| `src/scenes.tsx` | Hook, title, pitch, shop, pay, watch, wallet, safety, privacy, under the hood, close |
| `src/Chupke.tsx` | The composition: captions, voice, sound effects, the ducked soundtrack |
| `src/components.tsx` | Background, browser frame, badges, terminal, the wallet memo card, captions |
| `public/capture/` | Screen captures of the live site (`tools/record-live.cjs`) |
| `public/audio/use/` | The chosen voice takes (`vo01`–`vo12`) and the sound effects |
| `public/audio/voice/` | The takes levelled to the same loudness (`tools/level_voice.py`) |
| `tools/music.py` | Writes `public/audio/music.wav` (A minor, 96 BPM) |

## What is real and what is labelled

Everything on screen is either real or labelled as something else:
- **The hook's checkout form** is an illustration, badged "Illustration".
- **The live order is real.** On 4 Nov 2026, `tools/record-live.cjs` placed two orders on the live shop and paid them from the CLI buyer wallet with testnet coins:
  - MBZ6TXKA3Y (test card): payment `130c2799…7efa`, then the delivery memo `e6570b46…`.
  - WHD2NBHECQ (always-fails card): payment `c581517b…`, then the refund `c7d2d28f…`, about 80 s after the watch began.
- **Edits to the footage:**
  - The waiting part of the order page is sped up 4×, and the video badges it.
  - The reply address, QR codes and memos are blurred because they hold wallet addresses.
  - The terminal lines and the wallet memo are re-typeset from the real outputs (`buyer:pay`, `buyer:inbox`), with the code masked.
- **The other three safety cards** cite earlier live testnet runs (docs/NOTES.md): N3RVZ44M5G (over the cap), YMXHFE23J6 (duplicate payment) and Q5S258G7D0 (kill -9 mid-delivery).

## Build

```bash
npm install
```

```bash
python3 tools/timeline.py && python3 tools/level_voice.py && npm run music
```

```bash
npm run render
```

`npm run render` writes `out/chupke-raw.mp4`, then `tools/master.sh` brings it to streaming loudness as `out/chupke.mp4`.
`node tools/stills.mjs <bundle> <outdir> 12.5 47.6` renders stills at given seconds from a `remotion bundle` output.
To re-record the footage, run `node tools/record-live.cjs <base url> <file with a reply address>` (it places and pays real
testnet orders).
