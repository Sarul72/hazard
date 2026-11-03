# Монгол орны гамшгийн эрсдэлийн хяналт · Mongolia hazard watch

Үер, түймэр, шороон шуурганы эрсдэлийг 21 аймаг + Улаанбаатарт нээлттэй өгөгдлөөр харуулдаг вэб. Газрын зураг дээр NASA-гийн хиймэл дагуулын (MODIS, VIIRS, Landsat/Sentinel-2 HLS, GPM IMERG) зураг, түүн дээр загварын прогнозод суурилсан **0–100 харьцангуй индекс** байна.
A web page showing flood, wildfire and dust-storm indices for 21 aimags and Ulaanbaatar from open data, over NASA satellite imagery. Scores are **relative 0–100 indices from model forecasts, not probabilities and not official warnings.**

* Арга зүй / Methods: [docs/METHODS.md](docs/METHODS.md)
* Эх сурвалж / Sources and verification status: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)
* Хязгаарлалт / Limits: [docs/LIMITATIONS.md](docs/LIMITATIONS.md)
* Цаашдын ажил / Roadmap (Sentinel-1 flood, fuel state, validation): [docs/ROADMAP.md](docs/ROADMAP.md)

## Нийтлэх алхам (кодын мэдлэг шаардахгүй)

1. GitHub дээр шинэ репо үүсгэж, энэ хавтасны бүх файлыг (`.github` хавтасыг оруулаад) оруулна.
2. Репо → **Settings → Pages → Source: GitHub Actions** гэж сонгоно.
3. **Actions** таб → **Build and deploy site** → **Run workflow**. Ойролцоогоор 2–3 минутын дараа сайт `https://<хэрэглэгч>.github.io/<репо>/` хаягаар нээгдэнэ. Дараа нь 3 цаг тутам өгөгдлөө өөрөө шинэчилнэ.
4. (Заавал биш) **Actions → Flood return levels → Run workflow**: голын урсацын 2/5/20 жилийн буцалтын түвшнийг тооцно (нэг удаа, дараа нь жилд нэг).
5. (Заавал биш) Үнэгүй NASA FIRMS түлхүүр аваад (`firms.modaps.eosdis.nasa.gov/api/map_key`) репо → Settings → Secrets and variables → Actions → `FIRMS_MAP_KEY` нэрээр хадгалбал газрын зураг дээр сүүлийн 3 хоногийн гал илрүүлэлт гарна.

## Эхний удаа заавал шалгах зүйл / Verify first

Энэ хувилбарыг бодит үйлчилгээнүүдтэй (Open-Meteo, NASA GIBS) холбож туршиж чадаагүй, учир нь бүтээсэн орчин тэдгээр рүү хандаж чадаагүй. Туршилтууд хиймэл (mock) өгөгдлөөр хийгдсэн.

1. **Өгөгдөл ирж байна уу:** сайт нээгдээд дээд талын цонхонд «Шинэчлэгдсэн: …» гарч, жагсаалтад оноо харагдах ёстой. «Өгөгдлийг татаж чадсангүй» гарвал Open-Meteo-ийн хариу миний хүлээсэн хэлбэрээс өөр байна. Зохиомол утга харуулахгүй.
2. **Хиймэл дагуулын давхарга:** баруун самбарт давхарга бүрийг асаахад «боломжгүй» гарвал [Worldview](https://worldview.earthdata.nasa.gov)-ээс зөв нэрийг нь олж `js/config.js`-д засна ([DATA_SOURCES.md](docs/DATA_SOURCES.md)).

## Local run / development

```bash
npm test                 # 32 unit tests (Fire Weather Index vs published values, risk scoring, stress cases)
node scripts/build-latest.mjs        # needs internet; writes data/latest.json
python3 -m http.server 8080          # then open http://localhost:8080
```

Pure static site (ES modules, no build step). The browser reads `data/latest.json` if it is less than 6 h old, otherwise computes live from Open-Meteo and caches for 90 minutes. Open the site through a web server or GitHub Pages; opening `index.html` as a file does not work because of ES modules.

Third-party code: Leaflet 1.9.4 (BSD-2, `vendor/leaflet`). Mongolia outline: Natural Earth (public domain). Imagery: NASA GIBS/ESDIS. Weather: Open-Meteo.com (CC BY 4.0), contains modified Copernicus Atmosphere Monitoring Service information.
