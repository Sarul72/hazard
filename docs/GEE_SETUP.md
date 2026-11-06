# Earth Engine автомат шинэчлэлтийг асаах

Сайт өдөр бүр өөрөө шинэчлэгдэхийн тулд GitHub-ийн сервер Earth Engine-д нэвтрэх эрхтэй байх ёстой. Энэ нь таны хувийн нэвтрэлт биш, тусдаа **service account** байна. Нэг удаа хийнэ, 10 орчим минут.

## 1. Service account үүсгэх

1. [console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=sigma-513109) нээнэ. Дээр нь `Sigma` төсөл сонгогдсон эсэхийг шалгана.
2. **+ CREATE SERVICE ACCOUNT** дарна. Нэр: `hazard-gee`.
3. Эрх олгох алхамд дараах хоёрыг нэмнэ:
   - **Earth Engine Resource Writer**
   - **Service Usage Consumer**
4. **DONE** дарна.

Google-ийн хоёр заавар зөрдөг: нэг нь Resource Viewer хангалттай гэсэн, нөгөө нь тооцоололд Writer хэрэгтэй гэсэн. Энд ажиллах нь баталгаатай Writer-ийг сонгосон.

## 2. Түлхүүр үүсгэх

1. Шинэ `hazard-gee` бүртгэл дээр дарна → **Keys** → **Add key** → **Create new key** → **JSON** → **Create**.
2. JSON файл компьютерт татагдана.

**Анхаар:** энэ файл нууц үгтэй адил. GitHub-д файл хэлбэрээр бүү оруулна, хэнд ч бүү илгээнэ, бүү чатад наана. Алдвал Keys хэсгээс устгаад шинээр үүсгэнэ.

## 3. GitHub-д нууцаар хадгалах

1. [github.com/Sigma0sanaa/hazard/settings/secrets/actions](https://github.com/Sigma0sanaa/hazard/settings/secrets/actions) нээнэ.
2. **New repository secret** дарна.
3. Name: `EE_SERVICE_ACCOUNT_JSON`
4. Secret: JSON файлыг Notepad-оор нээж, бүх агуулгыг нь хуулж наана. **Add secret** дарна.
5. JSON файлыг компьютерээсээ устгана.

## 4. Шалгах

Репо → **Actions** → **Update risk from Earth Engine** → **Run workflow**. Хэдэн минутын дараа ногоон тэмдэг гарвал ажиллаж байна. Цаашид өдөр бүр Улаанбаатарын цагаар 06:40-д өөрөө ажиллана.

## Зардал

Энэ ажил нь өдөрт хэдэн минут Earth Engine тооцоо ашиглана. Үнэгүй Community түвшин сард 150 EECU-цаг өгдөг. Хэрэглээгээ [Cloud Console](https://console.cloud.google.com/earth-engine) дээрээс хянана уу.
