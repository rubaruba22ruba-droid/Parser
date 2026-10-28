import sys, torch, soundfile as sf
model = torch.package.PackageImporter(sys.argv[1]).load_pickle("tts_models", "model")
torch.set_num_threads(4)
out = sys.argv[2]
LINES = {
  "a": "Др+эйд Др+оп. Апгр+ейд тво+их под+арков!",
  "b": "Кр+ути колес+о!",
  "c": "Золот+ой вопр+ос — приз д+ороже ц+ели!",
  "d": "Др+эйд Др+оп.",
}
for sp in ["aidar", "eugene", "baya", "kseniya", "xenia"]:
    for k, t in LINES.items():
        a = model.apply_tts(text=t, speaker=sp, sample_rate=48000, put_accent=True, put_yo=True)
        sf.write(f"{out}/{sp}_{k}.wav", a.numpy(), 48000)
        print(sp, k, round(len(a) / 48000, 2))
