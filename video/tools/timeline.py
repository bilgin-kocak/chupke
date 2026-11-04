"""Builds src/timeline.json, the one clock for scenes, voiceover, captions and the soundtrack.
Voice line starts are set here; their lengths are measured from the chosen takes (public/audio/use/voNN.mp3)."""
import json, subprocess

FPS, BPM = 30, 96
LINES = [  # name, start (s), caption text (the take's words, without delivery tags)
    ("vo01", 0.6, "Buy a gift card online, and you hand over your email, your card, your name. Every purchase becomes a record of you."),
    ("vo02", 9.9, "So we built Chupke. It's Hindi for “quietly”."),
    ("vo03", 15.0, "You pay in shielded ZEC. An agent buys the card on Bitrefill, and sends the code straight to your own wallet, as an encrypted memo. No account. No email."),
    ("vo04", 27.0, "This is live, on testnet. I pick a card, and paste a fresh address from my wallet."),
    ("vo05", 33.4, "Then I pay the QR, from a shielded wallet."),
    ("vo06", 37.3, "The agent sees the payment, checks the limits, and buys the card from the shop's own Bitrefill balance."),
    ("vo07", 44.2, "And about a minute later, the code is in my wallet. Only my wallet can read it."),
    ("vo08", 50.4, "And it's careful with money. If the card fails, you're refunded, with the reason. Over the limit? Refunded. Pay twice? Refunded."),
    ("vo09", 60.2, "We even killed the agent mid-delivery. It still sent exactly one code."),
    ("vo10", 66.7, "Bitrefill never learns who you are. The chain sees only encrypted data. Codes are never stored, and your reply address is deleted an hour after delivery."),
    ("vo11", 77.8, "The public site holds no keys. A private worker, with a view-only inbox, does the buying."),
    ("vo12", 85.3, "Chupke. Gift cards, bought quietly."),
]
SCENES = {
    "hook": [0, 9.4], "title": [9.4, 14.6], "pitch": [14.6, 26.8], "shop": [26.8, 33.2], "pay": [33.2, 37.1],
    "watch": [37.1, 43.9], "wallet": [43.9, 50.0], "safety": [50.0, 66.3], "privacy": [66.3, 77.5],
    "hood": [77.5, 85.0], "close": [85.0, 91.5],
}


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def chunks(text, start, dur):
    """Caption chunks: split on sentence ends (and '?'), each timed by its share of the characters."""
    parts, cur = [], ""
    for word in text.split(" "):
        cur = f"{cur} {word}".strip()
        if cur.endswith((".", "?", "”.")) and len(cur) > 12:
            parts.append(cur)
            cur = ""
    if cur:
        parts.append(cur)
    merged = []
    for p in parts:  # keep chunks readable: join very short ones to the previous
        if merged and len(p) < 18 and len(merged[-1]) + len(p) < 70:
            merged[-1] = f"{merged[-1]} {p}"
        else:
            merged.append(p)
    total = sum(len(p) for p in merged)
    t, out = start, []
    for p in merged:
        d = dur * len(p) / total
        out.append({"text": p, "start": round(t, 3), "end": round(t + d, 3)})
        t += d
    return out


vo = {}
for name, start, text in LINES:
    d = duration(f"public/audio/use/{name}.mp3")
    vo[name] = {"start": start, "duration": round(d, 3), "file": f"audio/voice/{name}.mp3", "text": text, "captions": chunks(text, start, d)}
    nxt = [s for n, s, _ in LINES if s > start]
    if nxt and start + d > nxt[0] - 0.2:
        print(f"warning: {name} runs into the next line ({start + d:.2f} > {nxt[0]:.2f})")

beat = 60 / BPM
timeline = {"fps": FPS, "duration": 91.5, "bpm": BPM, "beat": beat, "drop": 9.4, "final": 85.3, "scenes": SCENES, "vo": vo}
json.dump(timeline, open("src/timeline.json", "w"), indent=1)
print("timeline written:", ", ".join(f"{n} {v['start']}+{v['duration']}" for n, v in vo.items()))
