# Promotional video template

The reusable template pairs a phone mockup with G2 glasses in one scene. The suggested-replies example includes a title card, Typecast narration, timestamp-based captions, a tap sound, and a 35-second H.264 export.

## Source files

- `docs/media/promo/g2-phone-template.png`: the previously approved phone and glasses composition. It is a promotional mockup, not a device photograph.
- `docs/media/promo/r1-hand-illustration.png`: generated illustrative hand and ring cutout. This is not footage or a precise product rendering.
- `tools/promo/narrate-replies.py`: requests the six English voice clips and word timestamps from the Typecast API.
- `tools/promo/render-replies.py`: creates the example HUD, captions, scene images, and video. Edit its scene text, timing, and `segments` for another announcement.

Use Python 3 with Pillow and FFmpeg. Supply a tap WAV that you have permission to use. The previous project output contains an Earshot tap at `output/even-notepad-preview/earshot-audio/tap_1.wav` on the original workstation; it is not included in this repository.

## Make a video

From the repository root:

```sh
python3 -m pip install Pillow
export TYPECAST_API_KEY='your-key'
python3 tools/promo/narrate-replies.py --work /tmp/quiet-terminal-promo
python3 tools/promo/render-replies.py --work /tmp/quiet-terminal-promo --tap /path/to/tap.wav
```

The result is `/tmp/quiet-terminal-promo/quiet-terminal-suggested-replies.mp4`. The work directory also contains the narration WAVs, timestamp JSON, captions, and generated images. Keep API keys out of source files, recordings, logs, and commits. API calls consume Typecast credits. Check the voice's current usage terms before publication.

## Adapt and verify

1. Write and approve the storyboard and narration before generating audio. Replace the six lines in `narrate-replies.py`; set the voice with `--voice` if needed.
2. Adjust `starts` and `segments` in the renderer to match the new clip durations. The captions use Typecast word timestamps relative to those starts. Confirm that speech does not overlap the next scene and check the last caption against the audio.
3. Keep the HUD source canvas at **576 × 288 pixels**. Draw only the HUD marks on transparency; do not add a background panel. Use `src/terminal-menu-layout.ts` for row positions and selected-border styling. The example is composed at 1920 × 1080 and exported at 1280 × 720: its enlarged HUD ends at 576 × 288 in the exported video. A second, reduced copy sits in the lens for context.
4. Use actual simulator or device captures for claims about real behavior whenever possible. The example HUD is a reconstruction of the menu layout and its scene changes are illustrative; it is not a recording of the app or the R1 ring.
5. Review the complete video and audio, including title, contrast, timing, caption spelling, colors, and device imagery. Check the output with `ffprobe` and decode it with FFmpeg. Confirm the font and visual proportions against the current simulator. Keep a record of any differences.

The approved mockup is a composited marketing image. Avoid presenting it as footage of physical hardware. Do not include private messages, tokens, or actual user documents in promotional assets.
