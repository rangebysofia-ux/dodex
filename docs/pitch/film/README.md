# Pitchfilmen – så görs den om

Filmen (90 s, 24 bilder/s) byggs av `film.html`. Varje bildruta räknas fram med `render(t)` och fotograferas, så rörelserna blir exakta.

1. Starta webbtjänsten med en enhet ”Björken” som har ett lagt schema, startdatum och timkostnad.
2. Ta skärmbilder: `node fanga.js bilder <enhet-id> <körning-id>`. Personsidan och simuleringen tas som helsidesbilder (`11-person.png`, `13-sim.png`).
3. Musik: `python3 musik.py`. Den syntetiseras (piano och mjuka syntar), utan beroenden utöver numpy.
4. Bildrutor: `node rendera.js 16x9` och `node rendera.js 9x16`.
5. Video:

```bash
ffmpeg -framerate 24 -i rutor-16x9/%05d.jpg -i musik.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest DODEX-Scheduler-pitch-16x9.mp4
```

Speakertexten ligger som textskyltar i filmen och som undertexter i `../DODEX-Scheduler-speaker.srt`. Filmen har ingen inläst röst.
