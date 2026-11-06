# Lugn, hoppfull ambient med piano och mjuka syntar, 92 s. Byggs försiktigt mot slutet.
import numpy as np, wave
SR = 44100; T = 92.0; n = int(SR * T); t = np.arange(n) / SR
ut = np.zeros((n, 2))
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def env(L, a, r):  # attack/release i sekunder
    e = np.ones(L); A = int(a * SR); R = int(r * SR)
    e[:A] = np.linspace(0, 1, A); e[-R:] *= np.linspace(1, 0, R); return e
def lagg(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR); j = min(n, i + len(sig)); s = sig[: j - i] * gain
    ut[i:j, 0] += s * (1 - pan) ** .5; ut[i:j, 1] += s * (1 + pan) ** .5
def piano(m, dur=3.2, vel=.5):
    L = int(dur * SR); x = np.arange(L) / SR; f = hz(m)
    ton = sum(a * np.sin(2 * np.pi * f * k * x + k) * np.exp(-x * (1.8 + k * 1.1)) for k, a in [(1, 1), (2, .45), (3, .22), (4, .1), (5, .05)])
    ton *= np.minimum(1, x / .006) * vel
    return ton * env(L, .005, .4)
def pad(ackord, dur, vel=.12):
    L = int(dur * SR); x = np.arange(L) / SR; s = np.zeros(L)
    for m in ackord:
        for d in (-.07, .07):
            s += np.sin(2 * np.pi * hz(m) * (1 + d / 100) * x) + .3 * np.sin(2 * np.pi * hz(m) * 2 * (1 + d / 100) * x)
    lfo = .85 + .15 * np.sin(2 * np.pi * .13 * x)
    return s / (len(ackord) * 2) * vel * lfo * env(L, 1.6, 1.8)
# ackord (MIDI): Cmaj9, Am7, Fmaj7, G6sus – 6 s vardera
ACK = [[48, 55, 60, 64, 67, 74], [45, 52, 57, 60, 64, 71], [41, 48, 53, 57, 60, 69], [43, 50, 55, 59, 62, 64]]
tid = 0.0; i = 0
while tid < 86:
    a = ACK[i % 4]; intens = min(1, 0.35 + tid / 75)
    lagg(pad(a[:4], 6.6, .11 + .05 * intens), tid)
    lagg(piano(a[0] - 12, 6, .28), tid, gain=.8)  # bas
    monster = [a[2], a[3], a[4], a[3], a[5], a[4]] if tid > 20 else [a[2], a[4], a[3]]
    steg = 6 / len(monster)
    for k, m in enumerate(monster):
        lagg(piano(m + (12 if tid > 55 and k % 3 == 2 else 0), 3.0, .22 + .12 * intens), tid + k * steg + .05, pan=(-.3 if k % 2 else .3))
    tid += 6; i += 1
# slutackord C
lagg(pad([48, 55, 60, 64, 67], 6.5, .16), 86); lagg(piano(36, 6, .3), 86)
for k, m in enumerate([60, 64, 67, 72]): lagg(piano(m, 5, .3), 86 + k * .18, pan=(-.2 if k % 2 else .2))
# enkel rumsklang (ekon)
for d, g in [(.11, .25), (.23, .18), (.37, .12), (.53, .08)]:
    D = int(d * SR); ut[D:, 0] += ut[:-D, 1] * g; ut[D:, 1] += ut[:-D, 0] * g
ut *= np.minimum(1, t / 2.5)[:, None] * np.minimum(1, (T - t) / 4)[:, None]
ut = ut / np.abs(ut).max() * .55
with wave.open("musik.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((ut * 32767).astype("<i2").tobytes())
print("ok")
