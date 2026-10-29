import type { HowCopy } from "./how-it-works-i18n";

/** Arabisch, Türkisch, Italienisch, Griechisch für „So funktioniert's". */
export const EXTRA: Record<"ar" | "tr" | "it" | "el", HowCopy> = {
  ar: {
    heading: "كيف يعمل",
    intro: "8 خطوات بسيطة للحصول على شاحنتك – من الحجز حتى الإرجاع.",
    cta: "احجز شاحنة الآن",
    steps: [
      { title: "اختر التاريخ", text: ["اختر أولاً الزر المناسب في الأعلى:", "تأجير يومي (من 3 إلى 24 ساعة): اضغط مرة واحدة على اليوم المطلوب.", "عدة أيام (أكثر من 24 ساعة): اضغط أولاً على يوم الاستلام ثم على يوم الإرجاع."] },
      { title: "الوقت والتعرفة", text: ["اختر الساعة التي تريد استلام الشاحنة فيها. ثم اختر التعرفة: عادية أو مع كيلومترات أكثر."] },
      {
        title: "المركبة والإضافات",
        text: ["اختر المركبة المناسبة. لكل شاحنة ترى حجم مساحة التحميل بالمتر المكعب والارتفاع وطول منطقة التحميل."],
        bullets: [
          "تقود داخل المدينة فقط؟ LEO MY 102 محدودة بسرعة 100 كم/ساعة – مثالية للمسافات القصيرة.",
          "رحلة على الطريق السريع؟ PF MY 1003 أكثر راحة.",
          "حمولة كبيرة أو طويلة؟ انتبه إلى طول منطقة التحميل.",
        ],
      },
      { title: "التحقق", text: ["التقط صورًا بسيطة لرخصة القيادة وبطاقة الهوية (الوجه والظهر) وارفعها."] },
      { title: "التسجيل والدفع", text: ["سجّل باستخدام بريدك الإلكتروني وكلمة مرور تختارها بنفسك. ثم ادفع عبر الإنترنت."] },
      {
        title: "رمز المفتاح عبر البريد الإلكتروني",
        text: ["ستحصل على تأكيد الحجز والفاتورة. قبل الاستلام بـ15 دقيقة تصلك رسالة برمز المفتاح ورقم صندوق المفاتيح."],
        videos: [
          { key: "open", caption: "كيف تفتح صندوق المفاتيح" },
          { key: "close", caption: "كيف تغلقه مرة أخرى" },
        ],
      },
      {
        title: "استلم المفتاح واذهب إلى الشاحنة",
        text: ["صناديق المفاتيح موجودة عند متجر OBI في ليونبرغ، أمام المدخل عند موقف الدراجات."],
        videos: [{ key: "obi", caption: "هنا تجد صناديق المفاتيح" }],
        after: [
          "الشاحنات متوقفة بالقرب من عنوان An der Poststraße 63 (حوالي 500 م). العنوان للتوجيه فقط.",
          "يرجى عدم قرع أي جرس باب – السكان لا علاقة لهم بالتأجير.",
        ],
      },
      {
        title: "القيادة والصور",
        text: ["تُفتح صفحة رحلتك في التطبيق. يمكنك أيضًا تشغيل الملاحة من هناك."],
        bullets: [
          "قبل الرحلة: صور عداد الكيلومترات وحالة المركبة.",
          "بعد الرحلة: عداد الكيلومترات، إيصال الوقود، الحالة الخارجية، المقصورة ومساحة التحميل.",
        ],
        after: ["الصور لحمايتك. إذا كانت ناقصة، يجب على موظف فحص المركبة. نحتسب لذلك 30 يورو على الأقل."],
      },
    ],
  },
  tr: {
    heading: "Nasıl çalışır",
    intro: "8 basit adımda kamyonetine ulaş – rezervasyondan teslime kadar.",
    cta: "Hemen kamyonet kirala",
    steps: [
      { title: "Tarihi seç", text: ["Önce yukarıdaki uygun düğmeye dokun:", "Günlük kiralama (3 ila 24 saat): İstediğin güne bir kez dokun.", "Birden fazla gün (24 saatten uzun): Önce teslim alma gününe, sonra iade gününe dokun."] },
      { title: "Saat ve tarife", text: ["Kamyoneti saat kaçtan itibaren istediğini seç. Sonra tarifeni seç: normal veya daha fazla kilometreli."] },
      {
        title: "Araç ve ekstralar",
        text: ["Uygun aracı seç. Her kamyonette yük hacmini metreküp olarak, yüksekliği ve yükleme alanının uzunluğunu görürsün."],
        bullets: [
          "Sadece şehir içinde mi? LEO MY 102 saatte 100 km ile sınırlıdır – kısa yollar için ideal.",
          "Otoyol yolculuğu mu? PF MY 1003 ile daha rahat gidersin.",
          "Çok veya uzun yük mü? Yükleme alanının uzunluğuna dikkat et.",
        ],
      },
      { title: "Doğrulama", text: ["Ehliyetinin ve kimliğinin (ön ve arka yüz) basit fotoğraflarını çek ve yükle."] },
      { title: "Kayıt ol ve öde", text: ["E-postan ve kendi seçtiğin bir şifre ile kayıt ol. Sonra çevrimiçi öde."] },
      {
        title: "E-posta ile anahtar kodu",
        text: ["Rezervasyon onayını ve faturayı alırsın. Teslim almadan 15 dakika önce anahtar kodun ve anahtar kutunun numarası ile bir e-posta gelir."],
        videos: [
          { key: "open", caption: "Anahtar kutusu nasıl açılır" },
          { key: "close", caption: "Tekrar nasıl kapatılır" },
        ],
      },
      {
        title: "Anahtarı al ve kamyonete git",
        text: ["Anahtar kutuları Leonberg'deki OBI'de, girişin önünde bisiklet parkındadır."],
        videos: [{ key: "obi", caption: "Anahtar kutuları burada" }],
        after: [
          "Kamyonetler An der Poststraße 63 adresinin yakınında park hâlindedir (yaklaşık 500 m). Adres sadece yön bulmak içindir.",
          "Lütfen hiçbir kapı zilini çalma – oradaki sakinlerin kiralamayla hiçbir ilgisi yoktur.",
        ],
      },
      {
        title: "Sürüş ve fotoğraflar",
        text: ["Uygulamada sürüş sayfan açılır. Navigasyonu da oradan başlatabilirsin."],
        bullets: [
          "Sürüşten önce: kilometre sayacı ve aracın durumunun fotoğrafları.",
          "Sürüşten sonra: kilometre sayacı, yakıt fişi, dış durum, iç mekân ve yük alanı.",
        ],
        after: ["Fotoğraflar senin güvenliğin içindir. Eksikse bir çalışanın aracı kontrol etmesi gerekir. Bunun için en az 30 € ücret alırız."],
      },
    ],
  },
  it: {
    heading: "Come funziona",
    intro: "In 8 semplici passi al tuo furgone – dalla prenotazione alla riconsegna.",
    cta: "Prenota ora un furgone",
    steps: [
      { title: "Scegli la data", text: ["Per prima cosa tocca in alto il pulsante giusto:", "Noleggio giornaliero (da 3 a 24 ore): tocca una volta il giorno desiderato.", "Più giorni (oltre 24 ore): tocca prima il giorno di ritiro e poi il giorno di riconsegna."] },
      { title: "Orario e tariffa", text: ["Scegli da che ora vuoi il furgone. Poi scegli la tariffa: normale o con più chilometri."] },
      {
        title: "Veicolo e accessori",
        text: ["Scegli il veicolo adatto. Per ogni furgone vedi il volume di carico in metri cubi, l'altezza e la lunghezza del vano di carico."],
        bullets: [
          "Solo in città? Il LEO MY 102 è limitato a 100 km/h – ideale per brevi tragitti.",
          "Viaggio in autostrada? Con il PF MY 1003 viaggi più comodo.",
          "Tanto carico o oggetti lunghi? Controlla la lunghezza del vano di carico.",
        ],
      },
      { title: "Verifica", text: ["Scatta semplici foto della patente e della carta d'identità (fronte e retro) e caricale."] },
      { title: "Registrati e paga", text: ["Registrati con la tua e-mail e una password scelta da te. Poi paghi online."] },
      {
        title: "Codice della chiave via e-mail",
        text: ["Ricevi la conferma di prenotazione e la fattura. 15 minuti prima del ritiro arriva un'e-mail con il codice e il numero della tua cassetta portachiavi."],
        videos: [
          { key: "open", caption: "Come aprire la cassetta portachiavi" },
          { key: "close", caption: "Come richiuderla" },
        ],
      },
      {
        title: "Ritira la chiave e vai al furgone",
        text: ["Le cassette portachiavi si trovano all'OBI di Leonberg, davanti all'ingresso presso le rastrelliere per biciclette."],
        videos: [{ key: "obi", caption: "Qui trovi le cassette portachiavi" }],
        after: [
          "I furgoni sono parcheggiati vicino all'indirizzo An der Poststraße 63 (circa 500 m). L'indirizzo serve solo come orientamento.",
          "Per favore non suonare a nessun campanello – i residenti non hanno nulla a che fare con il noleggio.",
        ],
      },
      {
        title: "Viaggio e foto",
        text: ["Nell'app si apre la pagina del tuo viaggio. Da lì puoi anche avviare la navigazione."],
        bullets: [
          "Prima del viaggio: foto del contachilometri e dello stato del veicolo.",
          "Dopo il viaggio: contachilometri, scontrino del carburante, stato esterno, abitacolo e vano di carico.",
        ],
        after: ["Le foto servono per la tua sicurezza. Se mancano, un dipendente deve controllare il veicolo. Per questo addebitiamo almeno 30 €."],
      },
    ],
  },
  el: {
    heading: "Πώς λειτουργεί",
    intro: "Σε 8 απλά βήματα στο βαν σου – από την κράτηση μέχρι την επιστροφή.",
    cta: "Κλείσε τώρα βαν",
    steps: [
      { title: "Επίλεξε ημερομηνία", text: ["Πρώτα πάτησε το σωστό κουμπί επάνω:", "Ημερήσια ενοικίαση (3 έως 24 ώρες): Πάτησε μία φορά την ημέρα που θέλεις.", "Πολλές ημέρες (πάνω από 24 ώρες): Πάτησε πρώτα την ημέρα παραλαβής και μετά την ημέρα επιστροφής."] },
      { title: "Ώρα και τιμολόγιο", text: ["Επίλεξε από ποια ώρα θέλεις το βαν. Μετά επίλεξε τιμολόγιο: κανονικό ή με περισσότερα χιλιόμετρα."] },
      {
        title: "Όχημα και αξεσουάρ",
        text: ["Επίλεξε το κατάλληλο όχημα. Για κάθε βαν βλέπεις τον όγκο φόρτωσης σε κυβικά μέτρα, το ύψος και το μήκος του χώρου φόρτωσης."],
        bullets: [
          "Μόνο στην πόλη; Το LEO MY 102 είναι περιορισμένο στα 100 km/h – ιδανικό για μικρές διαδρομές.",
          "Ταξίδι σε αυτοκινητόδρομο; Με το PF MY 1003 ταξιδεύεις πιο άνετα.",
          "Πολλά ή μακριά αντικείμενα; Πρόσεξε το μήκος του χώρου φόρτωσης.",
        ],
      },
      { title: "Επαλήθευση", text: ["Βγάλε απλές φωτογραφίες του διπλώματος οδήγησης και της ταυτότητας (μπροστά και πίσω) και ανέβασέ τες."] },
      { title: "Εγγραφή και πληρωμή", text: ["Κάνε εγγραφή με το e-mail σου και έναν κωδικό που επιλέγεις μόνος σου. Μετά πληρώνεις online."] },
      {
        title: "Κωδικός κλειδιού με e-mail",
        text: ["Λαμβάνεις επιβεβαίωση κράτησης και τιμολόγιο. 15 λεπτά πριν την παραλαβή έρχεται e-mail με τον κωδικό και τον αριθμό του κουτιού κλειδιών σου."],
        videos: [
          { key: "open", caption: "Πώς ανοίγεις το κουτί κλειδιών" },
          { key: "close", caption: "Πώς το κλείνεις ξανά" },
        ],
      },
      {
        title: "Πάρε το κλειδί και πήγαινε στο βαν",
        text: ["Τα κουτιά κλειδιών βρίσκονται στο OBI στο Leonberg, μπροστά από την είσοδο στις θέσεις ποδηλάτων."],
        videos: [{ key: "obi", caption: "Εδώ βρίσκονται τα κουτιά κλειδιών" }],
        after: [
          "Τα βαν είναι σταθμευμένα κοντά στη διεύθυνση An der Poststraße 63 (περίπου 500 m). Η διεύθυνση είναι μόνο για προσανατολισμό.",
          "Παρακαλούμε μην χτυπάς κανένα κουδούνι – οι κάτοικοι δεν έχουν καμία σχέση με την ενοικίαση.",
        ],
      },
      {
        title: "Οδήγηση και φωτογραφίες",
        text: ["Στην εφαρμογή ανοίγει η σελίδα της διαδρομής σου. Από εκεί μπορείς να ξεκινήσεις και την πλοήγηση."],
        bullets: [
          "Πριν τη διαδρομή: φωτογραφίες του χιλιομετρητή και της κατάστασης του οχήματος.",
          "Μετά τη διαδρομή: χιλιομετρητής, απόδειξη καυσίμου, εξωτερική κατάσταση, εσωτερικό και χώρος φόρτωσης.",
        ],
        after: ["Οι φωτογραφίες είναι για τη δική σου ασφάλεια. Αν λείπουν, ένας υπάλληλος πρέπει να ελέγξει το όχημα. Γι' αυτό χρεώνουμε τουλάχιστον 30 €."],
      },
    ],
  },
};
