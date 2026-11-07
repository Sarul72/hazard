/* Dust materials for the plume tool. Chemistry does not move dust through the air: density and particle size do, and
 * chemistry matters here through the density of the mineral. Sizes are the same for all materials (see plume.js), because
 * no measured size distribution of Mongolian mine dust was found. Densities in g/cm3. */
export const MATERIALS = [
  { id: "quartz", rho: 2.65, elements: "Si, O", mn: "Хөрс, кварцын тоос (SiO₂)", en: "Soil and quartz dust (SiO₂)", src: "USGS", note: { mn: "Талст цахиурын амьсгалын замын тоос: NIOSH-ийн ажлын байрны хязгаар 0.05 мг/м³, боломжит хорт хавдар үүсгэгч.", en: "Respirable crystalline silica: NIOSH workplace limit 0.05 mg/m³, potential carcinogen." } },
  { id: "coal", rho: 1.32, elements: "C", mn: "Нүүрс (C)", en: "Coal (C)", src: "USGS, bituminous average; range 1.23–1.72", note: { mn: "Хамгийн хөнгөн: хамгийн хол зөөгдөнө.", en: "The lightest: travels furthest." } },
  { id: "calcite", rho: 2.71, elements: "Ca, C, O", mn: "Шохойн чулуу (CaCO₃)", en: "Limestone (CaCO₃)", src: "mineral tables", note: { mn: "", en: "" } },
  { id: "fluorite", rho: 3.18, elements: "Ca, F", mn: "Жонш (CaF₂)", en: "Fluorite (CaF₂)", src: "mineral tables; 3.0–3.3", note: { mn: "", en: "" } },
  { id: "chalcopyrite", rho: 4.2, elements: "Cu, Fe, S", mn: "Зэсийн хүдэр (CuFeS₂)", en: "Copper ore (CuFeS₂)", src: "mineral tables; 4.1–4.3", note: { mn: "Хүдрийн тоосонд хүнцэл агуулагдаж болно: EU-ийн зорилтот түвшин PM10 дахь As жилд 6 нг/м³.", en: "Ore dust may hold arsenic: EU target value 6 ng/m³ As in PM10, annual." } },
  { id: "hematite", rho: 5.26, elements: "Fe, O", mn: "Төмрийн хүдэр (Fe₂O₃)", en: "Iron ore (Fe₂O₃)", src: "mineral tables", note: { mn: "", en: "" } },
  { id: "galena", rho: 7.5, elements: "Pb, S", mn: "Хар тугалганы хүдэр (PbS)", en: "Lead ore (PbS)", src: "mineral tables; 7.4–7.6", note: { mn: "Хамгийн хүнд: эх үүсвэрийн ойр сууна, гэхдээ хар тугалга бага тунгаар ч хортой.", en: "The heaviest: settles near the source, but lead is harmful even in small doses." } },
];

export const materialById = (id) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
