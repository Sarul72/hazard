/* Methods and materials, one window per hazard.
 * Every claim below was read in the cited source. Where a source could not be read in full, or where it disagrees
 * with itself, the text says so. Pipeline-dependent facts (which datasets really ran, which scores were measured)
 * come from manifest.json, not from this file. */
import { el } from "./dom.js";

const REF = {
  vanwagner: ["Van Wagner, C.E. (1987). Development and structure of the Canadian Forest Fire Weather Index System. Canadian Forestry Service, Forestry Technical Report 35.", "https://bac-lac.wayback.archive-it.org/web/20061102130554/http://fire.cfs.nrcan.gc.ca/research/environment/cffdrs/fwi_e.htm"],
  nasanbat16: ["Nasanbat, E., Lkhamjav, O. (2016). Wild fire risk map in the Eastern Steppe of Mongolia using spatial multi-criteria analysis. ISPRS Archives XLI-B1, 469.", "https://doi.org/10.5194/isprsarchives-XLI-B1-469-2016"],
  nasanbat18: ["Nasanbat, E., et al. (2018). A spatial distribution map of the wildfire risk in Mongolia using decision support system. ISPRS Archives XLII-3/W4, 357.", "https://doi.org/10.5194/isprs-archives-XLII-3-W4-357-2018"],
  farukh: ["Farukh, M.A., Hayasaka, H., Mishigdorj, O. (2009). Recent tendency of Mongolian wildland fire incidence: analysis using MODIS hotspot and weather data. Journal of Natural Disaster Science 31(1), 23-33.", "https://doi.org/10.2328/jnds.31.23"],
  wu23: ["Wu, J., Kurosaki, Y., Sekiyama, T.T., Maki, T. (2023). Effects of dry vegetation coverage estimated from the MODIS Soil Tillage Index on dust occurrence: verification by surface synoptic observations. J. Meteor. Soc. Japan 101(1), 67-77.", "https://doi.org/10.2151/jmsj.2023-004"],
  kurosaki07: ["Kurosaki, Y., Mikami, M. (2007). Threshold wind speed for dust emission in east Asia and its seasonal variations. J. Geophys. Res. 112, D17202.", "https://doi.org/10.1029/2006JD007988"],
  kurosaki05: ["Kurosaki, Y., Mikami, M. (2005). Regional difference in the characteristic of dust event in East Asia: relationship among dust outbreak, surface wind, and land surface condition. J. Meteor. Soc. Japan 83A, 1-18.", "https://doi.org/10.2151/jmsj.83A.1"],
  unspider: ["UN-SPIDER. Recommended Practice: Flood Mapping and Damage Assessment Using Sentinel-1 SAR Data in Google Earth Engine.", "https://un-spider.org/advisory-support/recommended-practices/recommended-practice-google-earth-engine-flood-mapping/step-by-step"],
  devries: ["DeVries, B., et al. (2020). Rapid and robust monitoring of flood events using Sentinel-1 and Landsat data on the Google Earth Engine. Remote Sens. Environ. 240.", "https://doi.org/10.1016/j.rse.2020.111664"],
  ubflood: ["Ishdorj, E., Lkhamjav, O., Ganbold, U. (2025). Integrating satellite remote sensing and dynamic GIS for urban flood risk modelling in Ulaanbaatar City. ISPRS Archives XLVIII-4/W14-2025, 75-81.", "https://doi.org/10.5194/isprs-archives-XLVIII-4-W14-2025-75-2025"],
  khovd: ["Narangerel, S., Suzuki, Y., Hasegawa, T., Takaichi, Y. (2025). Flood hazard mapping and disaster prevention recommendations based on detailed topographical analysis in Khovd City, Western Mongolia. Nat. Hazards Earth Syst. Sci. 25, 4563-4576.", "https://doi.org/10.5194/nhess-25-4563-2025"],
  ap42: ["US EPA. AP-42, Section 13.2.4, Aggregate Handling and Storage Piles: particle size multipliers.", "https://gaftp.epa.gov/ap42/ch13/s024/draft/d13s0204.pdf"],
  aermod: ["Thurman, J. (2019). Deposition in AERMOD: overview. 12th Conference on Air Quality Modeling, US EPA. Method 1: diameter, mass fraction and density by size bin.", "https://gaftp.epa.gov/Air/aqmg/SCRAM/conferences/2019_12th_Conference_On_Air_Quality_Modeling/Presentations/2-6_12thMC-Deposition.pdf"],
  hysplit: ["NOAA ARL. HYSPLIT User's Guide: deposition. Particles defined by diameter, density and shape; Stokes settling.", "https://www.ready.noaa.gov/hysplitusersguide/S314.htm"],
  briggs: ["Briggs, G.A. (1973). Diffusion estimation for small emissions. ATDL Contribution File 79, NOAA; formulas as reproduced in a course page.", "https://cyclone.unbc.ca/presentations/ccwwf/aq/node6.html"],
  horst: ["Horst, T.W. (1984). Comparison of diffusion-deposition models and plume depletion corrections. Boundary-Layer Meteorology (read from a search summary only).", "https://link.springer.com/article/10.1007/BF00121964"],
  usgscoal: ["USGS Circular 891, Coal Resource Classification System: average specific gravity of coal by rank.", "https://pubs.usgs.gov/circ/c891/table2.htm"],
  usgsquartz: ["USGS. Gemstones: quartz specific gravity 2.65.", "https://pubs.usgs.gov/gip/gemstones/mineral.html"],
  eu2004: ["Directive 2004/107/EC, Annex I: target values for arsenic, cadmium and nickel in PM10.", "https://www.legislation.gov.uk/eudr/2004/107/annex/I"],
  niosh: ["NIOSH Pocket Guide: silica, crystalline (as respirable dust).", "https://www.cdc.gov/niosh/npg/npgd0684.html"],
  egu2019: ["Abstract EGU2019-6274-2: dust at the Baganuur and Tumurtolgoi mines of Mongolia.", "https://meetingorganizer.copernicus.org/EGU2019/EGU2019-6274-2.pdf"],
  mjgg: ["Environmental conditions in the mining areas of the Umnugovi province of Mongolia. Mongolian Journal of Geography and Geoecology.", "https://mongoliajol.info/index.php/MJGG/article/view/4093"],
  gum: ["JCGM 100:2008. Evaluation of measurement data: Guide to the expression of uncertainty in measurement (GUM).", "https://www.bipm.org/en/committees/jc/jcgm/publications"],
  olofsson: ["Olofsson, P., et al. (2014). Good practices for estimating area and assessing accuracy of land change. Remote Sens. Environ. 148, 42-57.", "https://eprints.nottingham.ac.uk/44846/"],
  weatherhead: ["Weatherhead, E.C., et al. (2000). Detecting the recovery of total column ozone. J. Geophys. Res. 105(D17), 22201-22210, eq. 2; after Weatherhead, E.C., et al. (1998). Factors affecting the detection of trends. J. Geophys. Res. 103, 17149-17161.", "https://doi.org/10.1029/98JD00995"],
};

const COMMON_ERROR = {
  mn: [
    "Талбайн дундаж нь өргөргийн косинусаар жигнэгдэнэ, учир нь хойд зүгт нүдний талбай багасдаг.",
    "Өдрийн алдаа нь GUM (JCGM 100)-ийн дагуу гурван хэсгийн квадрат нийлбэр: оролтын өгөгдөл, загвар, орон зайн түүвэр. Өргөтгөсөн алдаа U = 2·u꜀ (≈95%).",
    "Чиг хандлагын p утгыг гурван аргаар харуулна: энгийн OLS, автокорреляцаар засварласан түүвэр, AR(1) регресс. Эхнийх нь хамгийн өөдрөг байдаг тул сүүлийн хоёрыг гол гэж үзнэ.",
    "Илрэх жил нь Weatherhead нарын n* томьёогоор, 90% магадлалтайгаар тооцогдоно.",
  ],
  en: [
    "Area means are weighted by the cosine of latitude, because cells shrink towards the north.",
    "The daily error follows the GUM (JCGM 100): input data, model and spatial sampling added in quadrature. Expanded uncertainty U = 2·u꜀ (about 95 %).",
    "The trend p value is shown three ways: plain OLS, an autocorrelation-adjusted sample, and AR(1) regression. The first is the most optimistic, so read the last two.",
    "Detection years use the n* formula of Weatherhead et al. at 90 % probability.",
  ],
};

export const METHODS = {
  fire: {
    mn: {
      title: "Түймэр: арга зүй, материал",
      lead: "Олон улсын FWI, Монголд туршсан олон шалгуурт үнэлгээ хоёрыг нэгтгэж, хиймэл дагуулын бодит түймрээр тохируулсан оноо.",
      method: [
        "Өдөр бүрийн цаг агаарын галын аюул: Канадын FWI системийг (Van Wagner 1987) ERA5-Land-ын 13:00 цагийн (УБ) температур, чийгшил, салхи, 24 цагийн хур тунадсаар бүхэл торон дээр бодно. Цас ≥ 1 см нүдэнд кодууд эхний утгадаа буцна. Numpy код нь cffdrs-ийн лавлах утгатай таарсан.",
        "Суурь эмзэг байдал: Nasanbat нарын (2016, 2018) олон шалгуурт үнэлгээ, Malczewski-ийн rank-sum жин. Түлэгдсэн талбайн давтамж (MCD64A1), галын цэгийн нягт (FIRMS), газрын бүрхэвч (MCD12Q1), SPI. Галын аюулын албан ёсны зураг, галын харуулын байрлал нээлттэй биш тул хасаж, үлдсэн жинг дахин нормчилсон.",
        "Тохируулга: хиймэл дагуулын идэвхтэй галд (MODIS FIRMS, 0.1° нүд, өдөр) логистик регрессээр FWI, эмзэг байдал, өмнөх сарын NDVI-г тааруулна. 2001–2017 оноор сургаад, үзээгүй 2018–2025 оноор шалгасан; ашиглалтын коэффициентыг дараа нь бүх оноор дахин тооцсон.",
        "Оноо нь улсын дунджаас хэд дахин их магадлалтайг 4-ийн зэргээр хэмжинэ: 1/4-өөс бага бол «Маш бага», 1/4–1 «Бага», 1–4 «Дунд», 4–16 «Өндөр», 16-аас их бол «Маш өндөр».",
        "Тухайн өдөр хиймэл дагуул гал илрүүлсэн нүд өдрийн зурагт дор хаяж 90 оноо авна. Олон жилийн статистикт энэ ажиглалт ордоггүй.",
      ],
      limits: [
        "Хайлтаар Монгол оронд FWI-г шууд шалгасан нийтлэгдсэн судалгаа олдсонгүй. Энд шалгахад FWI ганцаараа сул (AUC 0.67), учир нь түүхий FWI говьд хамгийн өндөр гардаг ч тэнд шатах зүйл бараг байхгүй.",
        "Шалгалтын онуудад галын давтамж бага байсан (жилд ≈400, өмнө нь ≈1700) тул өндөр ангиудад загварын оноо ажиглалтаас ≈20 оноо өндөр гарсан. Энэ нь загварын алдаанд орсон.",
        "Гал нь ховор үзэгдэл тул нэг нүд, нэг өдрийн түвшинд «өндөр» гэсэн 1000 тохиолдлын 1 орчимд л гал гардаг. Оноо нь гал гарна гэсэн таамаг биш, эрсдэл хаана төвлөрснийг харуулна.",
        "Галын цэгийн нягт, түлэгдсэн талбайн давтамж ижил хиймэл дагуулаас гардаг тул онуудыг тусгаарласан шалгалт хийсэн ч орон зайн хэв маяг өмнөх түймрийн давталт дээр суурилна.",
        "Шалгуурын 5 ангийн хязгаар (квартил), газрын бүрхэвчийн зэрэглэл нь бидний сонголт, эх өгүүллийн утга биш.",
        "2018 оны өгүүллийн хүснэгтэд SPI-ийн жин 0.01 гэж хэвлэгдсэн боловч өгүүллийн томьёогоор 2/21 ≈ 0.10 гарна. Энд томьёоны утгыг ашиглав.",
        "Nasanbat нарын (2016) загварын нийт нарийвчлал 62% байсан. Тэр тоо, энд гарсан AUC хоёр өөр хэмжүүр тул шууд харьцуулахгүй.",
        "Монгол дахь түймрийн 95 орчим хувь хүний үйл ажиллагаанаас шалтгаалдаг гэж Erdenetuya (2012)-ийг иш татан бичсэн байдаг. Загвар гал асах үйл явдлыг мэдэхгүй.",
        "Торын нарийвчлал 0.1° (≈8–11 км). Зураг дээрх жигд ирмэг нь зөвхөн зурах аргаас үүснэ.",
      ],
      refs: ["vanwagner", "nasanbat16", "nasanbat18", "farukh"],
    },
    en: {
      title: "Wildfire: methods and materials",
      lead: "The international FWI combined with a multi-criteria method tested in Mongolia, calibrated to fires actually seen by satellite.",
      method: [
        "Daily fire weather: the Canadian FWI System (Van Wagner 1987) on the whole grid, from ERA5-Land temperature, humidity and wind at 13:00 Ulaanbaatar time and 24-hour precipitation. Where snow is at least 1 cm the codes return to their start values. The numpy code matches the cffdrs reference values.",
        "Baseline susceptibility: the multi-criteria method of Nasanbat et al. (2016, 2018) with Malczewski rank-sum weights: burnt-area frequency (MCD64A1), hotspot density (FIRMS), land cover (MCD12Q1), SPI. The official fire danger map and fire guard positions are not open, so those criteria are dropped and the other weights renormalised.",
        "Calibration: logistic regression of FWI, susceptibility and the NDVI of the previous month on satellite active fire (MODIS FIRMS, 0.1 degree cell, day). Trained on 2001–2017 and tested on the unseen years 2018–2025; production coefficients were then refitted on all years.",
        "The score measures how many times likelier a fire is than the national average, in powers of 4: below 1/4 very low, 1/4–1 low, 1–4 moderate, 4–16 high, above 16 very high.",
        "A cell where a satellite detected fire that day gets at least 90 on the daily map. Long-term statistics leave this observation out.",
      ],
      limits: [
        "No published study validating FWI directly for Mongolia was found. Tested here, FWI alone is weak (AUC 0.67), because raw FWI peaks in the Gobi, where there is almost nothing to burn.",
        "Fires were rarer in the test years (about 400 a year against 1700 before), so in the high classes the score ran about 20 points above what was observed. This is included in the model error.",
        "Fire is rare: at the level of one cell and one day, only about 1 in 1000 'high' cases has a fire. The score shows where risk concentrates; it does not predict a fire.",
        "Hotspot density and burnt-area frequency come from the same satellites. The test years are held out, but the spatial pattern still rests on fires repeating where they burned before.",
        "The class limits of the criteria (quartiles) and the land cover ranks are our choice, not values from the papers.",
        "The 2018 paper prints the SPI weight as 0.01, but its own formula gives 2/21 ≈ 0.10. The formula value is used.",
        "The overall accuracy of Nasanbat and Lkhamjav (2016) was 62 %. That and the AUC here are different measures and cannot be compared directly.",
        "About 95 % of fires in Mongolia are reported to be human-caused (Erdenetuya 2012, as cited there). The model knows nothing about ignition.",
        "The grid is 0.1 degree (about 8–11 km). Smooth edges on the map come only from drawing.",
      ],
      refs: ["vanwagner", "nasanbat16", "nasanbat18", "farukh"],
    },
    data: [
      ["ERA5-Land (ECMWF)", "≈9 км", { mn: "FWI-ийн цаг агаар, цасан бүрхүүл", en: "FWI weather, snow" }],
      ["MODIS MCD64A1", "500 м", { mn: "Түлэгдсэн талбайн давтамж", en: "Burnt-area frequency" }],
      ["MODIS/VIIRS FIRMS", "375 м – 1 км", { mn: "Галын цэгийн нягт, шалгалтын лавлагаа", en: "Hotspot density, verification reference" }],
      ["MODIS MCD12Q1", "500 м", { mn: "Газрын бүрхэвч", en: "Land cover" }],
      ["CHIRPS", "≈5 км", { mn: "SPI хуурайшилт", en: "SPI dryness" }],
    ],
  },
  dust: {
    mn: {
      title: "Шороон шуурга: арга зүй, материал",
      lead: "Салхи, газрын гадаргын төлөвийг хиймэл дагуулаар ажигласан агаар дахь тоостой тохируулсан оноо.",
      method: [
        "Өдрийн хамгийн их салхи: ERA5-Land-ын 3 цаг тутмын 10 м салхи, SYNOP ажиглалтын давтамжтай ижил.",
        "Гадаргын төлөв: өмнөх сарын хуурай ургамал (MCD43A4-ийн 6/7-р сувгийн харьцаа STI, Wu нар 2023-ын индекс), NDVI, хөрсний чийг, нүцгэн газрын хувь (MCD12Q1). Цас ≥ 1 см нүдэнд оноо 0.",
        "Тохируулга: 3–5-р сард Sentinel-5P TROPOMI аэрозолийн индексийн хазайлт ≥ 1 болсон нүд-өдрийг логистик регрессээр 2019–2023 оноор сургаад, үзээгүй 2024–2026 оноор шалгасан.",
        "TROPOMI-ийн индексийг шууд биш, нүд бүрт ±15 өдрийн медианаас хазайлтаар ашиглана: цэвэр агаарын түвшин 2021 онд −1.0-аас 0 болж шилжсэн тул тогтмол босго 2022-оос өмнөх шуургыг алдаж, түүнээс хойшхи өдрүүдийг хэтрүүлдэг.",
        "Оноо нь түймрийнхтэй ижил хэмжүүртэй. Тухайн өдөр индексийн хазайлт ≥ 1.5, салхи ≥ 6 м/с бол өдрийн зурагт дор хаяж 80 оноо авна. Олон жилийн статистикт энэ ажиглалт ордоггүй.",
      ],
      limits: [
        "Энэ загварын ур чадвар дунд зэрэг (AUC 0.69), салхи ганцаараа 0.63. Шороон шуурганы эрсдэлийн тоог түймрийнхээс болгоомжтой уншина уу.",
        "TROPOMI-ийн индекс зөөгдсөн тоос, утааг ч харуулдаг, өдөрт нэг удаа л хэмждэг. Орон нутгийн дэгдэлтийн хамгийн зөв лавлагаа нь цаг уурын станцын SYNOP ажиглалт бөгөөд одоохондоо ашиглаагүй.",
        "Wu нарын босго салхины тэгшитгэлийг шууд хэрэглээгүй: өгүүллийн тэгшитгэлүүдийг уншиж чадаагүй тул STI-г зөвхөн тайлбарлагч хувьсагчаар авсан.",
        "Индексийн хазайлт ≥ 1 босго нь бидний сонголт.",
        "Wu нарын аргын ашиг 3-р сард сул (R² 0.54, 0.75-ын эсрэг): хөлдүү хөрс, цасыг нэмж тооцох шаардлагатай.",
        "Kurosaki, Mikami (2007)-ийн тоон утгуудыг зөвхөн хураангуйгаас уншсан.",
        "Ажиглалт 2018-оос эхэлдэг тул 2001–2017 оны оноо нь шалгагдаагүй онуудын загварчлал юм.",
      ],
      refs: ["wu23", "kurosaki07", "kurosaki05"],
    },
    en: {
      title: "Dust storm: methods and materials",
      lead: "Wind and land surface state, calibrated to dust in the air as seen by satellite.",
      method: [
        "Highest wind of the day: ERA5-Land 10 m wind every 3 hours, the same interval as SYNOP observations.",
        "Surface state: dry vegetation of the previous month (the MCD43A4 band 6/7 ratio STI, the index of Wu et al. 2023), NDVI, soil water, bare ground share (MCD12Q1). Snow of at least 1 cm gives a score of 0.",
        "Calibration: logistic regression on cell-days with a Sentinel-5P TROPOMI aerosol index anomaly of at least 1 in March–May, trained on 2019–2023 and tested on the unseen years 2024–2026.",
        "The TROPOMI index is used as a departure from its local ±15-day median, not directly: its clean-air level moved from −1.0 to 0 in 2021, so a fixed threshold misses storms before 2022 and over-counts after.",
        "The score scale is the same as for wildfire. An anomaly of at least 1.5 with wind of at least 6 m/s gives at least 80 on the daily map. Long-term statistics leave this observation out.",
      ],
      limits: [
        "The skill of this model is moderate (AUC 0.69; wind alone 0.63). Read dust numbers more cautiously than wildfire numbers.",
        "The TROPOMI index also sees transported dust and smoke and measures once a day. The best reference for local emission is SYNOP weather station reports, which are not used yet.",
        "The threshold wind equations of Wu et al. are not applied directly: they could not be read from the paper, so STI enters only as a predictor.",
        "The anomaly threshold of 1 is our choice.",
        "The gain of the method of Wu et al. is weak in March (R² 0.54 against 0.75): frozen soil and snow also have to be handled.",
        "The figures of Kurosaki and Mikami (2007) were read from an abstract only.",
        "Observations start in 2018, so scores for 2001–2017 are model output for years that could not be checked.",
      ],
      refs: ["wu23", "kurosaki07", "kurosaki05"],
    },
    data: [
      ["ERA5-Land (ECMWF)", "≈9 км", { mn: "10 м салхи, хөрсний чийг, цас", en: "10 m wind, soil moisture, snow" }],
      ["MODIS MCD43A4", "500 м", { mn: "Хуурай ургамал (STI)", en: "Dry vegetation (STI)" }],
      ["MODIS MCD19A2 (MAIAC)", "1 км", { mn: "Аэрозолийн оптик зузаан", en: "Aerosol optical depth" }],
      ["Sentinel-5P TROPOMI", "≈5.5 км", { mn: "UV аэрозолийн индекс", en: "UV aerosol index" }],
    ],
  },
  flood: {
    mn: {
      title: "Үер: арга зүй, материал",
      lead: "Хиймэл дагуулын хур тунадас, цас хайлалтын давтагдах хугацаанд суурилсан оноо.",
      method: [
        "Усны орц: GPM IMERG V07-ийн хиймэл дагуулын хур тунадас ба ERA5-Land-ын цас хайлалтын 3 хоногийн нийлбэр. Цас хайлалтыг оруулсан нь чухал: Global Flood Database-ын Монголын 12 үерийн 6 нь цас хайлалттай холбоотой.",
        "Давтагдах хугацаа: нүд бүрт 2001–2025 оны жилийн хамгийн их утгаас Gumbel тархалтыг L-моментоор (Hosking 1990) тооцно. GloFAS-ын сэрэмжлүүлгийн түвшний адилаар 2, 5, 20, 100 жил нь 40, 60, 80, 100 оноо.",
        "Хүчин зүйлс: 5 мм-ээс бага ус оноо өгөхгүй, 20 мм-ээс дээш бүрэн тооцогдоно, ингэснээр говийн 3 мм «дээд амжилт» үер болохгүй. Нүдний усны шугамаас 5 м-ийн дотор байгаа хувь (MERIT Hydro) оноог жигнэнэ.",
        "Үерийн тохиолдол цөөн тул загвар тохируулаагүй, зөвхөн бүртгэгдсэн үертэй тулгаж шалгасан.",
      ],
      limits: [
        "Энэ оноо нь ажиглагдсан усан бүрхэвч биш, усны орцын эрсдэл юм. UN-SPIDER-ийн Sentinel-1 аргаар улс даяар усны талбайг тооцох ажил хараахан хийгдээгүй. Усны ажиглалтыг «Хиймэл дагуулын зураг» цэсний давхаргуудаас харна уу.",
        "5, 20 мм-ийн хязгаар, усны шугамын жин нь бидний сонголт, Монголд тохируулаагүй.",
        "Global Flood Database-ын 12 үерээс бороотой үерийн 6-аас 4-т оноо ≥ 60 болсон (2013, 2018 онд 97–99), харин цас хайлалтын үерийн 6-аас зөвхөн 1-д. Хаврын үерийн эрсдэлийг энэ оноо дутуу харуулдаг.",
        "Үерийн загварт загварын алдаа тооцоогүй: 12 тохиолдол хангалтгүй. Тиймээс алдааг «≥» гэж доод хязгаараар харуулна.",
        "IMERG-ийн эрт жилүүд (2014-өөс өмнө) өөр хиймэл дагуулуудад тулгуурладаг тул урт хугацааны чиг хандлагад болгоомжтой хандана уу.",
        "Хотын хэсэг газрын аадар бороо (30 минутад 10–40 мм) нь 10 км-ийн торонд зөөлрөн алга болж болно.",
        "Олдсон Монголын судалгаанууд голчлон хот, дүүргийн түвшинд хийгдсэн.",
      ],
      refs: ["unspider", "devries", "ubflood", "khovd"],
    },
    en: {
      title: "Flood: methods and materials",
      lead: "A score from the return period of satellite rainfall and snowmelt.",
      method: [
        "Water input: three-day sum of GPM IMERG V07 satellite rainfall and ERA5-Land snowmelt. Snowmelt matters: 6 of the 12 Mongolian floods in the Global Flood Database involve it.",
        "Return period: per cell, a Gumbel distribution fitted by L-moments (Hosking 1990) to the annual maxima of 2001–2025. As with GloFAS alert levels, 2, 5, 20 and 100 years give 40, 60, 80 and 100 points.",
        "Modifiers: below 5 mm of water there is no score and from 20 mm it counts in full, so a 3 mm record in the Gobi is no flood. The share of the cell within 5 m of drainage (MERIT Hydro) weights the score.",
        "Floods on record are too few to fit a model, so the score is only checked against them.",
      ],
      limits: [
        "This score is the risk from water input, not observed inundation. Country-wide water mapping with the UN-SPIDER Sentinel-1 method has not been done yet. See the layers under Satellite imagery for observed water.",
        "The 5 and 20 mm limits and the drainage weight are our choice, not tuned for Mongolia.",
        "Of the 12 floods in the Global Flood Database, the score reached 60 in 4 of the 6 rain floods (97–99 in 2013 and 2018) but in only 1 of the 6 snowmelt floods. This score understates spring flood risk.",
        "No model error is estimated for flood: 12 events are not enough. The error is therefore shown as a lower bound (≥).",
        "The early IMERG years (before 2014) rest on other satellites, so read long-term trends with care.",
        "Local cloudbursts (10–40 mm in 30 minutes) can vanish in a 10 km grid.",
        "Mongolian studies found are mostly at city or district level.",
      ],
      refs: ["unspider", "devries", "ubflood", "khovd"],
    },
    data: [
            ["GPM IMERG", "≈10 км", { mn: "Хур тунадас", en: "Rainfall" }],
      ["MERIT Hydro", "≈90 м", { mn: "Голын сүлжээ, газрын хэлбэр", en: "River network, terrain" }],
      ["ERA5-Land (ECMWF)", "≈9 км", { mn: "Цас хайлалт, хөрсний чийг", en: "Snowmelt, soil moisture" }],
    ],
  },
};

METHODS.plume = {
  mn: {
    title: "Тоосны тархалт: арга зүй, материал",
    lead: "Салхиар зөөгдөх Гауссын «puff» загвар. Тоосны төрөл бүр ширхэгийн хэмжээ, нягтаараа өөр хурдтай сууна.",
    method: [
      "Элемент өөрөө тархалтыг өөрчилдөггүй. AERMOD (Method 1), HYSPLIT зэрэг олон улсын загварууд ширхэгийг диаметр, нягт, хэлбэрээр тодорхойлдог. Тиймээс сонгосон төрөл эрдсийн нягтаар дамжин нөлөөлнө.",
      "Ширхэгийн 5 бүлэг: US EPA AP-42 13.2.4-ийн үржүүлэгч (30 мкм-ээс бага 0.74, 15-аас бага 0.48, 10-аас бага 0.35, 5-аас бага 0.20, 2.5-аас бага 0.053).",
      "Бүлэг бүрийн суух хурд: Стоксын тэгшитгэл, Каннингемийн залруулгатай, AERMOD Method 1-ийн Vg-тэй ижил хэлбэр.",
      "Агаараас алдагдах хурд: хагас Гауссын баганын гадаргын концентраци √(2/π)/σz-ээр (Chamberlain-ийн эх үүсвэрийн хомсдолын арга). σz нь Briggs-ийн задгай талбайн D анги, 1000 м-ийн холимог давхаргаар хязгаарлагдсан.",
      "Индексийн хэмжүүр бүх төрөлд ижил: суулгүй агаарт үлдсэн бол гарах байсан хамгийн хүчтэй цэг. Тиймээс хүнд эрдсийн тархац үнэхээр жижиг харагдана.",
    ],
    limits: [
      "Бүх төрөлд ижил ширхэгийн хэмжээ авсан: Монголын уурхайн тоосны хэмжсэн хуваарилалт олдсонгүй. AP-42-ийн хэмжээ нь аэродинамик диаметр боловч энд физик диаметр гэж уншсан. Энэ бол бидний таамаглал бөгөөд бодит ялгаа үүнээс өөр байж болно.",
      "Эх үүсвэрийн хомсдолын арга хялбарчилсан бөгөөд гадаргын ойролцоох босоо өөрчлөлтийг тооцдоггүй (Horst 1984). Ширхэгийн инерци, суусан тоос дахин хийсэх, хөрсний барзгаршил, бороо ороогүй.",
      "HYSPLIT-ийн гарын авлагад Стоксын тэгшитгэл 20 мкм-ээс том ширхэгт суух хурдыг хэтрүүлдэг гэсэн, манай хамгийн том бүлэг 21 мкм.",
      "Үр дүн нь харьцангуй индекс, концентраци биш. Монгол Улсын MNS 4585:2016 стандартын хязгаарыг шалгаж чадаагүй, мөн концентраци мэдэхгүй тул ямар ч хязгаартай шууд харьцуулж болохгүй.",
      "Уурхайн орчны хөрсөнд Ni, Cu, Zn, As өндөр илэрсэн судалгаа бий ч агаар дахь тоосны найрлагыг хэмжсэн судалгаа Таван толгой, Оюу толгойд олдсонгүй. Тиймээс сонголт нь тухайн уурхайн бодит найрлага биш, зөвхөн эрдсийн төрөл.",
    ],
    refs: ["aermod", "hysplit", "ap42", "briggs", "horst", "usgscoal", "usgsquartz", "niosh", "eu2004", "egu2019", "mjgg"],
  },
  en: {
    title: "Dust plume: methods and materials",
    lead: "A Gaussian puff model carried by the wind. Each dust type settles at its own speed according to particle size and density.",
    method: [
      "An element does not change the spread by itself. International models such as AERMOD (Method 1) and HYSPLIT define a particle by diameter, density and shape, so the chosen type acts through the density of the mineral.",
      "Five size bins from the US EPA AP-42 13.2.4 multipliers (0.74 below 30 µm, 0.48 below 15, 0.35 below 10, 0.20 below 5, 0.053 below 2.5).",
      "Settling speed of each bin: Stokes with the Cunningham correction, the same form as Vg in AERMOD Method 1.",
      "Loss from the air: surface concentration of a half-Gaussian column, √(2/π)/σz (Chamberlain source depletion). σz is Briggs open-country class D, capped by a 1000 m mixed layer.",
      "The index scale is the same for all types: the strongest spot the dust would reach if none of it settled. A heavy mineral therefore really shows a smaller plume.",
    ],
    limits: [
      "All types use the same particle sizes: no measured distribution of Mongolian mine dust was found. AP-42 sizes are aerodynamic but are read as physical sizes here. This is our assumption, and real differences may not match it.",
      "Source depletion is a simplification and ignores the change of the vertical profile near the ground (Horst 1984). Particle inertia, resuspension, surface roughness and rain are left out.",
      "The HYSPLIT guide says Stokes overestimates fall speeds above about 20 µm; our largest bin is 21 µm.",
      "The result is a relative index, not a concentration. The limits of Mongolian standard MNS 4585:2016 could not be checked, and without a concentration no limit can be compared directly.",
      "Studies report high Ni, Cu, Zn and As in soils near mines, but none measuring airborne dust composition at Tavan Tolgoi or Oyu Tolgoi was found. The choice is a mineral type, not the real composition of a mine.",
    ],
    refs: ["aermod", "hysplit", "ap42", "briggs", "horst", "usgscoal", "usgsquartz", "niosh", "eu2004", "egu2019", "mjgg"],
  },
  data: [
    ["Open-Meteo (ERA5, forecast)", "≈25 км", { mn: "Цаг тутмын салхи", en: "Hourly wind" }],
    ["Open-Meteo (CAMS)", "≈45 км", { mn: "Эх үүсвэр дэх тоос, харьцуулахад", en: "Dust at the source, for comparison" }],
    ["Кадастр, малчны бүртгэл", "≈1 км болгосон", { mn: "Өртсөн өвөлжөө, хаваржаа", en: "Exposed camps" }],
  ],
};

METHODS.all = {
  mn: {
    title: "Нэгдсэн эрсдэл: арга зүй, материал",
    lead: "Нүд бүрт гурван эрсдэлийн хамгийн өндөр оноог харуулна. Өөр хоорондоо нийлбэр биш: шалтгаан нь өөр үзэгдлүүдийг нэмбэл оноо утгаа алддаг.",
    method: ["Нэгдсэн оноо = max(үер, түймэр, шороон шуурга). Алдаа нь тухайн нүдэнд хамгийн өндөр оноо өгсөн эрсдэлийнх байна.", "Эрсдэл тус бүрийн арга зүйг өөрийнх нь цонхноос харна уу."],
    limits: ["Хамгийн өндрийг авах нь нэг нүдэнд хоёр эрсдэл зэрэг өндөр байхыг харуулахгүй."],
    refs: [],
  },
  en: {
    title: "Combined risk: methods and materials",
    lead: "Each cell shows the highest of the three hazard scores. They are not added: summing unrelated phenomena would make the score meaningless.",
    method: ["Combined score = max(flood, wildfire, dust storm). The error is that of the hazard giving the highest score in the cell.", "See each hazard's own window for its method."],
    limits: ["Taking the maximum hides cases where two hazards are high in one cell at once."],
    refs: [],
  },
  data: [],
};

export function openMethods(dlg, hazard, { lang, t, manifest }) {
  const m = METHODS[hazard], c = m[lang] ?? m.mn;
  const list = (items) => el("ul", {}, items.map((s) => el("li", { text: s })));
  const refs = [...c.refs, "gum", "olofsson", "weatherhead"];
  const sources = manifest?.sources?.[hazard];
  const rows = sources ? sources.map((s) => [s.name, s.resolution, s.role]) : m.data.map(([a, b, r]) => [a, b, r[lang] ?? r.mn]);
  dlg.replaceChildren(...[
    el("button", { class: "dlg-x", type: "button", "aria-label": t("close"), text: "✕", onclick: () => dlg.close() }),
    el("h2", { text: c.title }), el("p", { class: "lead", text: c.lead }),
    el("h3", { text: t("m_method") }), list(c.method),
    rows.length ? el("h3", { text: t("m_material") }) : null,
    rows.length && !sources && hazard !== "plume" ? el("p", { class: "dlg-warn", text: t("m_planned") }) : null,
    rows.length ? el("table", {}, el("thead", {}, el("tr", {}, ["m_col_data", "m_col_res", "m_col_role"].map((k) => el("th", { text: t(k) })))), el("tbody", {}, rows.map((r) => el("tr", {}, r.map((v) => el("td", { text: v })))))) : null,
    el("h3", { text: t("m_error") }), list(COMMON_ERROR[lang] ?? COMMON_ERROR.mn),
    el("h3", { text: t("m_limits") }), list(c.limits),
    el("h3", { text: t("m_refs") }),
    el("ol", { class: "refs" }, refs.map((k) => el("li", {}, el("a", { href: REF[k][1], target: "_blank", rel: "noopener", text: REF[k][0] })))),
  ].filter(Boolean));
  dlg.showModal();
}
