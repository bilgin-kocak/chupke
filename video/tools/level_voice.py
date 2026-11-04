"""Evens out the voiceover: every chosen take (public/audio/use/voNN.mp3) is brought to the same loudness
(-19 LUFS, true peak -1.5 dBTP) as public/audio/voice/voNN.mp3."""
import json, os, subprocess

T = json.load(open("src/timeline.json"))
os.makedirs("public/audio/voice", exist_ok=True)
for name in T["vo"]:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"public/audio/use/{name}.mp3", "-af", "loudnorm=I=-19:TP=-1.5:LRA=7",
                    "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", f"public/audio/voice/{name}.mp3"], check=True)
    print("levelled", name)
