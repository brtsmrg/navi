# Navi voice research, 25 Nov 2026

Claude cannot hear audio. Everything below is from reading sources. Which voice sounds right is your call by ear.

## Read this first

- **Not done: video research.** No co-driver videos were transcribed. Only web pages were read. The video part is still open.
- **Not tested:** none of the fixes below were run on your PC voice. They are the most likely causes and fixes, not proven ones.

## 1. "What is he saying at the end?" is probably the engine, not the wording

You heard a mumble after "right three into left three". Three sources point at the voice engine:

- NVIDIA's Chatterbox guide warns that very short lines (under about 5 words) are more likely to produce artifacts, and that incomplete fragments can get extra unintelligible audio after the spoken word. "Right three into left three" is exactly that size.
- A community fix for Chatterbox says it forces the end of speech on short lines to cure "trailing speech hallucinations" (Chatterbox issue 97).
- Kokoro's own model card lists weakness on short lines (under 10 to 20 tokens). Same family of problem, different engine.

**Likely fixes, cheapest first (to build next, not built yet):**
1. Trim the tail: cut each clip at the end of the last clear word, add a 40 ms fade.
2. Auto-check: make 3 takes per call, keep the one whose length is closest to the expected length for that wording, discard takes with sound after the last word.
3. Bundle: render the call inside a longer carrier line and cut the call out.
4. Lower the "cfg_weight" setting (needs a listening test).

## 2. Engines

| Engine | Licence | Fit for Navi |
|---|---|---|
| Chatterbox (what the PC voice uses) | MIT | **Retired.** Its maker marks it unmaintained as of Aug 2026. Code and models still work; no fixes will come. Fine for rendering a fixed clip library now, risky as a long-term base. |
| Qwen3-TTS (0.6B and 1.7B) | Apache-2.0 | **Best next candidate.** First audio in about 97 ms, 3-second voice cloning, voice design from a text description, 10 languages. Needs roughly 4 to 8 GB of video memory, so it fits your RTX 3080 Ti. Not yet compared by ear. |
| Kokoro-82M | Apache-2.0 | Tiny and fast, no cloning, weak on short lines. A fallback, not a first choice. |
| Voxtral TTS (Mistral) | **CC BY-NC (non-commercial)** | **Ruled out.** Cannot be used in a paid product. Open weights only ship fixed preset voices. |

Because Navi plays **pre-rendered clips** of a fixed vocabulary, the engine only matters when you build the clips on your PC. Swapping engines later does not touch the app. So: keep Chatterbox for now, add the tail fix, and run a Qwen3-TTS A/B test when you want one.

Licence note: all licences above come from the model pages and papers found by search. They are not legal advice. Check each model card again before shipping.

## 3. Wording

What real co-drivers do (Race and Rally guide, Wikipedia, Assetto Corsa Rally guide, Safari Rally write-up):
- "Into" means two corners are linked with no gap, and the first one is read first. "Right 4 into left 2" means: right 4 first, then left 2.
- "And" means the corners are separate, with some road between them.
- A plain number between calls is a distance in metres, for example "50".
- Co-drivers read at a pace that keeps the driver informed without being so far ahead that it is forgotten.

So **"right three into left three" is the real convention.** Right comes first. Your question was fair: the phrase is only clear if you know the code.

| Wording | Reads as | Good | Weak |
|---|---|---|---|
| W1 "Right three into left three" | Real rally style | Matches what rally drivers know. Shortest. | Needs the "into" convention. Short line triggers the tail artifact. |
| W2 "Right three, then left three" | Plain English | Anyone understands it. | Longer. "Then" sounds like a gap, not a link. |
| W3 "Right three. Into left three." | Two calls | Clear. | The pause cuts the link; two clips doubles the artifact risk. |

**Recommendation:** make W1 the Rally dialect (default for rally fans), make W2 the Plain dialect (default for everyone else), and drop W3. Fix the tail first, then listen again before changing anything. Navi already has dialect settings, so no new setting is needed.

Navigation research (TravTek and later work) says short calls, little chatter, and high clarity matter most. That supports keeping both versions short.

## 4. What to do next

1. Add the tail trim and 3-take check to the home voice, then re-render "right three into left three" and listen.
2. Pick W1 or W2 as the default for new users.
3. Optional: an A/B of Qwen3-TTS against Chatterbox on 10 calls.
4. Video research: still open.

## Sources

- Chatterbox guide, short-line artifacts: https://docs.nvidia.com/ace-for-games/chatterbox-tts/programming-guide-tts-chatterbox.html
- Chatterbox trailing-speech fix (ONNX build): https://huggingface.co/hugbos/chatterbox-multilingual-ONNX-v2
- Chatterbox early-termination issue: https://github.com/resemble-ai/chatterbox/issues/519
- Kokoro short-line weakness: https://huggingface.co/hexgrad/Kokoro-82M/commit/aab4d9f9ad6ddeb8d19a44f2a000920090f800ea
- Qwen3-TTS paper: https://arxiv.org/abs/2601.15621
- Qwen3-TTS models: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base
- Qwen3-TTS memory needs: https://dev.to/gary_yan_86eb77d35e0070f5/qwen3-tts-complete-guide-to-open-source-text-to-speech-model-9oe
- Voxtral TTS licence: https://huggingface.co/mistralai/Voxtral-4B-TTS-2603
- Voxtral open weights, fixed voices only: https://slator.com/mistral-text-to-speech-model/
- Pacenote conventions: https://raceandrally.com/blogs/all-blog-posts/rally-pacenotes-explained
- Pacenotes overview: https://en.wikipedia.org/wiki/Pacenotes
- "And" means a gap: https://coachdaveacademy.com/tutorials/pace-notes-in-asseto-corsa-rally/
- "Into" and linked hazards: https://nation.africa/kenya/life-and-style/dn2/pace-notes-a-few-words-from-the-safari-jabber-jockeys-4987796
