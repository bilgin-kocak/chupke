"""The Chupke soundtrack, synthesized from src/timeline.json so the drop and the final hit land on the video's clock.
A minor, 96 BPM, night-time and quiet: warm pads and a soft pluck motif under the hook, a riser into the title drop,
then a gentle pulse (soft kick, shaker) under the demo, a lighter break for the privacy section, and a last chord.
Writes public/audio/music.wav (44.1 kHz stereo)."""
import json, wave
import numpy as np

T = json.load(open("src/timeline.json"))
SR, DUR = 44100, T["duration"]
BEAT = 60 / T["bpm"]
BAR = 4 * BEAT
DROP, FINAL = T["drop"], T["final"]
PRIV = T["scenes"]["privacy"]
N = int(DUR * SR) + SR
L, R = np.zeros(N), np.zeros(N)
rng = np.random.default_rng(7)


def put(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N or i + len(sig) <= 0:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt((1 - pan) / 2)
    R[i : i + len(sig)] += sig * np.sqrt((1 + pan) / 2)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) if na else e[:na]
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def pad(chord, start, seconds, gain):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for m in chord:
        for det in (-0.07, 0.0, 0.07):
            f = hz(m) * 2 ** (det / 12)
            s += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) + 0.25 * np.sin(4 * np.pi * f * t)
    s *= env(n, min(1.2, seconds / 3), min(1.4, seconds / 2)) / (len(chord) * 3)
    put(s, start, gain, pan=-0.15)
    put(s, start + 0.013, gain * 0.9, pan=0.15)


def pluck(m, start, gain=1.0, pan=0.0):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = hz(m)
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * np.exp(-t * 3.2)
    s *= env(n, 0.004, 0.2)
    put(s, start, gain * 0.42, pan)
    put(s * 0.35, start + BEAT * 0.75, gain * 0.42, -pan)  # a soft echo


def kick(start, gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t * 28)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    put(s, start, gain * 0.55)


def shaker(start, gain=1.0):
    n = int(0.09 * SR)
    s = rng.normal(0, 1, n) * np.exp(-np.arange(n) / SR * 55)
    s = np.diff(s, prepend=0)  # bright
    put(s, start, gain * 0.05, pan=0.3)


def bass(m, start, seconds, gain=1.0):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * hz(m) * t) * env(n, 0.02, 0.3)
    put(s, start, gain * 0.22)


def riser(start, end, gain=1.0):
    n = int((end - start) * SR)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    k = np.linspace(0.002, 0.25, n)  # an opening one-pole filter
    y = np.zeros(n)
    acc = 0.0
    for i in range(n):
        acc += k[i] * (noise[i] - acc)
        y[i] = acc
    y *= np.linspace(0, 1, n) ** 2
    put(y, start, gain * 0.5)


def hit(start, gain=1.0):
    pad([45, 52, 57, 60, 64], start, 5.5, gain * 1.2)
    n = int(2.8 * SR)
    t = np.arange(n) / SR
    s = rng.normal(0, 1, n) * np.exp(-t * 2.2)
    put(np.convolve(s, np.ones(40) / 40, "same"), start, gain * 0.08)
    kick(start, gain * 1.1)


# A minor progression: Am - F - C - G (each a bar), voiced low and warm.
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]]
ROOTS = [45, 41, 48, 43]
MOTIF = [76, 72, 69, 72, 74, 72, 69, 67]

# Before the drop: pads and a sparse motif.
t, i = 0.0, 0
while t < DROP - 0.05:
    seconds = min(BAR + 0.5, DROP - t + 0.3)
    pad(CHORDS[i % 4], t, seconds, 0.85)
    if t + 2 * BEAT < DROP - 1.5:
        pluck(MOTIF[(2 * i) % 8], t + BEAT * 1.0, 0.6, -0.2)
        pluck(MOTIF[(2 * i + 1) % 8], t + BEAT * 2.5, 0.5, 0.2)
    t += BAR
    i += 1
riser(DROP - 2.4, DROP, 0.6)

# From the drop: the pulse.
hit(DROP, 1.0)
t, i = DROP, 0
while t < FINAL - 0.05:
    in_break = PRIV[0] <= t < PRIV[1]
    seconds = min(BAR + 0.5, FINAL - t + 0.2)
    pad(CHORDS[i % 4], t, seconds, 0.75 if in_break else 0.6)
    bass(ROOTS[i % 4], t, min(BAR, FINAL - t), 0.6 if in_break else 1.0)
    for b in range(4):
        bt = t + b * BEAT
        if bt >= FINAL - 0.05:
            break
        if not in_break and t > DROP + 2 * BAR - 0.01:
            kick(bt, 0.9 if b in (0, 2) else 0.55)
        for s8 in (0, 0.5):
            if not in_break and bt + s8 * BEAT < FINAL:
                shaker(bt + s8 * BEAT, 1.0 if s8 else 0.6)
    for k, step in enumerate((0.0, 1.5, 2.0, 3.0)):
        st = t + step * BEAT
        if st < FINAL - 0.2 and (i % 2 == 0 or k < 2):
            pluck(MOTIF[(i * 2 + k) % 8], st, 0.5 if in_break else 0.38, (-0.25, 0.25)[k % 2])
    t += BAR
    i += 1
riser(FINAL - 1.6, FINAL, 0.4)
hit(FINAL, 1.1)
for k, m in enumerate((69, 72, 76, 81)):
    pluck(m, FINAL + 0.4 + k * BEAT * 0.5, 0.55, (-0.3, 0.3)[k % 2])

# A short room: two quiet delays, then normalize and fade out.
for d, g in ((0.11, 0.18), (0.23, 0.1)):
    n = int(d * SR)
    L[n:] += R[:-n] * g
    R[n:] += L[:-n] * g
fade = np.ones(N)
fn = int(1.5 * SR)
end = int(DUR * SR)
fade[end - fn : end] = np.linspace(1, 0, fn)
fade[end:] = 0
L *= fade
R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.85, R / peak * 0.85
pcm = (np.stack([L, R], axis=1)[: end] * 32767).astype(np.int16)
with wave.open("public/audio/music.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"music.wav {DUR:.1f} s, {T['bpm']} BPM, drop {DROP}, final {FINAL}")
