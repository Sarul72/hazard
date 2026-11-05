# Mongolia hazard watch · Монгол орны гамшгийн эрсдэлийн хяналт

**Open it online / Онлайнаар нээх: https://sigma0sanaa.github.io/hazard/**
(any browser, phones included; send the link to anyone / утсан дээр ч нээгдэнэ, холбоосыг хэнд ч илгээж болно)

Нэмэлт суулгац шаардлагагүй. Нүүр хуудас: дээд талд **Үер · Түймэр · Шороон шуурга**. «Шороон шуурга»-г сонгоход дотор нь **Аймгууд · Уурхайн тоос · Polygon эрсдэл** гарна. / No installation. Top tabs: Flood · Wildfire · Dust storm; under Dust storm: Provinces · Mine dust · Polygon risk.

| What is real satellite data | What is a model |
|---|---|
| NASA GIBS imagery: VIIRS / MODIS true colour, MODIS Deep Blue dust aerosol, VIIRS/MODIS fire detections, flood extent, Landsat + Sentinel-2 surface water and HLS 30 m | Risk scores (Fire Weather Index, dust, flood) and the dust plume use weather and CAMS model data (Open-Meteo), not satellite pixels |

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

## Шалгасан байдал / Verification status

* Open-Meteo өгөгдлийн татаж авалт GitHub Actions дээр бодитоор ажилласан (22/22 цэг).
* NASA GIBS давхаргын нэр, тайлын төрлийг GIBS-ийн өөрийн GetCapabilities-аас уншиж баталгаажуулсан ([docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)).
* Эрсдэлийн онооны босго утгууд калибрлагдаагүй ([docs/LIMITATIONS.md](docs/LIMITATIONS.md)).

## Local run / development

```bash
npm test                 # 32 unit tests (Fire Weather Index vs published values, risk scoring, stress cases)
node scripts/build-latest.mjs        # needs internet; writes data/latest.json
python3 -m http.server 8080          # then open http://localhost:8080
```

Pure static site (ES modules, no build step). The browser reads `data/latest.json` if it is less than 6 h old, otherwise computes live from Open-Meteo and caches for 90 minutes. Open the site through a web server or GitHub Pages; opening `index.html` as a file does not work because of ES modules.

Third-party code: Leaflet 1.9.4 (BSD-2, `vendor/leaflet`). Mongolia outline: Natural Earth (public domain). Imagery: NASA GIBS/ESDIS. Weather: Open-Meteo.com (CC BY 4.0), contains modified Copernicus Atmosphere Monitoring Service information.
