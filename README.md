# Speedpunk AI — Illustrator 2024 extension
Interactive curvature-comb visualiser rebuilt from
[yanone/speedpunk](https://github.com/yanone/speedpunk).

### Features
* Live curvature combs with gamma & stroke scaling  
* Straight-segment ticks auto-fill the segment  
* Heat-map colour presets (viridis / magma / gray-→-red …)  
* Heavy >1 s auto-stop safety

### Install (dev build)

```bash
git clone https://github.com/hayashihikaru/speedpunk-ai-illustrator.git
cp -r speedpunk-ai-illustrator \
   "$HOME/Library/Application Support/Adobe/CEP/extensions/"
defaults write com.adobe.CSXS.11 PlayerDebugMode 1   # mac
