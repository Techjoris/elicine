import { TermsTranslations, ConsentModalTranslations } from '../termsTypes';

export const consentModalEs: ConsentModalTranslations = {
  title: "Condiciones y Privacidad",
  description: "Para disfrutar del descubrimiento cinematográfico inteligente y de nuestras recomendaciones personalizadas, por favor acepta nuestros términos de servicio y política de protección de datos.",
  readTermsLink: "Consultar la totalidad de los Términos y la Política de Privacidad",
  checkbox: "He leído y acepto los Términos y Condiciones de Uso y la Política de Privacidad.",
  button: "Aceptar y continuar"
};

export const termsEs: TermsTranslations = {
  backBtn: "Volver",
  backToApp: "Volver a la aplicación",
  title: "Términos y Condiciones de Uso y Política de Privacidad",
  effectiveDateLabel: "Fecha de entrada en vigor",
  effectiveDate: "7 de septiembre de 2026",
  lastUpdatedLabel: "Última actualización",
  lastUpdated: "7 de septiembre de 2026",
  intro: [
    "Los presentes Términos y Condiciones de Uso y de Privacidad (en adelante, los «Términos») regulan legalmente el acceso y uso de la plataforma digital y aplicación web progresiva (PWA) Éliciné (en adelante, el «Servicio»), accesible en la dirección oficial https://elicine.app así como en todos sus subdominios asociados.",
    "El acceso al Servicio, la navegación en la aplicación y la creación de una cuenta de usuario implican la aceptación expresa, previa y sin reservas de la totalidad de las disposiciones contenidas en este documento."
  ],
  copyright: "Éliciné © 2026",
  articles: [
    {
      id: "article-1",
      title: "ARTÍCULO 1: IDENTIFICACIÓN DEL EDITOR Y ALOJAMIENTO",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { label: "Denominación del servicio", text: "Éliciné" },
            { label: "Sitio oficial", text: "https://elicine.app", link: "https://elicine.app" },
            { label: "Contacto de soporte y reclamaciones", text: "contact@elicine.app", email: "contact@elicine.app" },
            { label: "Delegado de Protección de Datos (DPO / Privacy)", text: "support@elicine.app", email: "support@elicine.app" },
            { label: "Alojamiento e infraestructura de red", text: "Servidores cloud distribuidos de alta disponibilidad y protocolos de cifrado SSL/TLS de extremo a extremo." },
            { label: "Base de datos y gestión de sesiones", text: "Infraestructura gestionada por Supabase (servidores certificados ISO 27001 y SOC 2 Type II)." },
            { label: "Proveedor de metadatos cinematográficos", text: "Metadatos, sinopsis, créditos artísticos y carteles provistos a través de la API de The Movie Database (TMDB)." }
          ]
        }
      ]
    },
    {
      id: "article-2",
      title: "ARTÍCULO 2: DESCRIPCIÓN GENERAL DEL SERVICIO",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné pone a disposición de los cinéfilos y espectadores un entorno interactivo dedicado a:"
        },
        {
          type: "bullet_list",
          items: [
            { text: "La búsqueda semántica y multicriterio de obras cinematográficas y audiovisuales." },
            { text: "La generación de recomendaciones personalizadas impulsadas por inteligencia artificial." },
            { text: "La creación de espacios personales (listas de seguimiento, favoritos, historial de consulta)." },
            { text: "La consulta de disponibilidad legal de streaming según áreas geográficas." },
            { text: "La suscripción a planes digitales premium denominados «Pass Pro»." }
          ]
        },
        {
          type: "paragraph",
          text: "El Servicio procura garantizar la coherencia y actualización permanente de la información mostrada, pero no puede garantizar la precisión absoluta de los catálogos de plataformas externas ni la exhaustividad total de los metadatos de terceros."
        }
      ]
    },
    {
      id: "article-tmdb",
      title: "ARTÍCULO: FUENTES DE DATOS CINEMATOGRÁFICOS Y MENCIÓN TMDB",
      blocks: [
        {
          type: "paragraph",
          text: "La información sobre películas, fichas técnicas, sinopsis, créditos del equipo, puntuaciones y carteles mostrados en Éliciné proviene de la base de datos The Movie Database (TMDB)."
        },
        {
          type: "callout",
          calloutText: "Aviso legal: Este producto utiliza la API de TMDB pero no está respaldado ni certificado por TMDB (This product uses the TMDB API but is not endorsed or certified by TMDB).",
          calloutSubtext: "Éliciné es una iniciativa independiente que no mantiene ninguna afiliación directa ni asociación oficial con TMDB."
        }
      ]
    },
    {
      id: "article-3",
      title: "ARTÍCULO 3: REGISTRO, AUTENTICACIÓN Y SEGURIDAD DE LA CUENTA",
      blocks: [
        {
          type: "subsection",
          title: "3.1. Modalidades de autenticación externa (Google OAuth)",
          text: "Con el fin de garantizar una alta seguridad operativa y eliminar los riesgos inherentes al almacenamiento de contraseñas no cifradas, Éliciné utiliza exclusivamente el protocolo estándar de autenticación Google OAuth 2.0.",
          items: [
            { label: "Cero almacenamiento de credenciales", text: "Éliciné no solicita, consulta, procesa ni almacena en ningún momento la contraseña de su cuenta de Google." },
            { label: "Transmisión de datos autorizados", text: "Al seleccionar «Continuar con Google», el usuario autoriza a Google a transmitir los datos estrictamente necesarios: identificador único de cuenta (Google UID), nombre completo, correo electrónico verificado y fotografía de perfil pública." }
          ]
        },
        {
          type: "subsection",
          title: "3.2. Responsabilidad del usuario",
          text: "Cada usuario es responsable de la confidencialidad del acceso a su dispositivo físico y de la seguridad de su sesión activa. Toda acción realizada desde una cuenta iniciada se presume efectuada por su titular."
        }
      ]
    },
    {
      id: "article-4",
      title: "ARTÍCULO 4: POLÍTICA DE PRIVACIDAD Y GESTIÓN DE DATOS PERSONALES",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné aplica una estricta política de minimización de datos: únicamente se recopilan los datos técnica y funcionalmente indispensables."
        },
        {
          type: "subsection",
          title: "4.1. Categorías de datos tratados",
          items: [
            { label: "Datos de perfil de usuario", text: "Identificador técnico único de Supabase, dirección de correo electrónico, nombre de usuario y fotografía de perfil facilitada por el proveedor de identidad." },
            { label: "Datos de sesión y preferencias", text: "Listas de películas guardadas, preferencias de consulta, estado de suscripción Pass Pro e historial de interacciones con el asistente IA." },
            { label: "Datos de conexión y ubicación técnica", text: "Dirección IP técnica (procesada temporalmente para seguridad de redes), User-Agent, idioma declarado del navegador y región geográfica aproximada (país/zona horaria). Esta ubicación se utiliza exclusivamente para configurar el idioma de interfaz y filtros regionales de catálogo." }
          ]
        },
        {
          type: "subsection",
          title: "4.2. Finalidades del tratamiento",
          text: "Los datos recopilados se someten a un tratamiento automatizado con los siguientes fines:",
          orderedItems: [
            "Apertura, mantenimiento seguro y sincronización de la sesión del usuario en PWA y navegadores web.",
            "Asignación y activación instantánea de las funciones vinculadas al estatus Pass Pro.",
            "Personalización algorítmica de sugerencias cinematográficas.",
            "Prevención de abusos, accesos no autorizados y fraude técnico."
          ]
        },
        {
          type: "subsection",
          title: "4.3. Prohibición total de comercialización de datos",
          text: "Éliciné prohíbe de manera tajante la venta de datos: ninguna información personal, correo electrónico, historial de búsqueda o perfil de uso se cede, alquila, vende o comparte con intermediarios de datos (data brokers), anunciantes o redes publicitarias externas."
        },
        {
          type: "subsection",
          title: "4.4. Plazo de conservación",
          text: "Los datos asociados a la cuenta de usuario se conservan durante el período de actividad de la misma. En caso de inactividad prolongada superior a veinticuatro (24) meses consecutivos o a petición expresa del usuario, la totalidad de los datos personales se purga de forma definitiva e irreversible."
        }
      ]
    },
    {
      id: "article-5",
      title: "ARTÍCULO 5: OFERTA «PASS PRO», CONDICIONES DE PRECIO Y PAGOS",
      blocks: [
        {
          type: "subsection",
          title: "5.1. Naturaleza y alcance de la oferta",
          text: "El usuario tiene la opción de suscribirse al plan de pago Pass Pro (tarifa de referencia: 1,99 $ USD o equivalente en moneda local al momento del pago). Esta opción elimina los límites de consulta con la IA, activa filtros de búsqueda avanzados y otorga acceso prioritario a nuevas funciones."
        },
        {
          type: "subsection",
          title: "5.2. Seguridad de las transacciones financieras",
          text: "Los pagos se gestionan a través de pasarelas de pago autorizadas y certificadas (tarjetas bancarias internacionales y servicios de pago móvil regionales).",
          items: [
            { label: "Sin almacenamiento bancario", text: "Éliciné no almacena, no visualiza y no archiva números de tarjetas de pago, códigos CVV ni datos bancarios confidenciales." },
            { label: "Validación encriptada", text: "Las plataformas de pago únicamente transmiten un token técnico de confirmación (webhook) que certifica el éxito de la transacción para activar los privilegios Pro en la cuenta del usuario." }
          ]
        }
      ]
    },
    {
      id: "article-6",
      title: "ARTÍCULO 6: PROPIEDAD INTELECTUAL Y LICENCIA DE USO",
      blocks: [
        {
          type: "subsection",
          title: "1. Marca y software Éliciné",
          text: "La denominación Éliciné, el dominio https://elicine.app, la arquitectura del software, el diseño visual, la experiencia de usuario y los algoritmos propios son propiedad exclusiva del editor y están protegidos por leyes de propiedad intelectual."
        },
        {
          type: "subsection",
          title: "2. Contenidos cinematográficos",
          text: "Los títulos de películas, carteles oficiales, fotografías de rodaje, fragmentos de sinopsis y elementos promocionales pertenecen íntegramente a sus respectivos productores, directores, distribuidores y titulares de derechos. Éliciné no reclama ningún derecho de propiedad sobre estos materiales externos exhibidos con fines de indexación y difusión cultural."
        }
      ]
    },
    {
      id: "article-7",
      title: "ARTÍCULO 7: EXCLUSIÓN DE GARANTÍAS Y LIMITACIÓN DE RESPONSABILIDAD",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { text: "El Servicio está disponible 24/7 salvo posibles incidencias técnicas, mantenimiento programado o fallos atribuibles a las redes de telecomunicaciones." },
            { text: "Las sugerencias de inteligencia artificial se ofrecen a título informativo y de entretenimiento. El editor no asume responsabilidad por posibles discrepancias menores en los metadatos o por recomendaciones que no se ajusten a las preferencias subjetivas del usuario." }
          ]
        }
      ]
    },
    {
      id: "article-8",
      title: "ARTÍCULO 8: EJERCICIO DE DERECHOS Y ELIMINACIÓN DE CUENTA",
      blocks: [
        {
          type: "paragraph",
          text: "Todo usuario tiene derecho a acceder a sus datos, solicitar su rectificación, oponerse al tratamiento por motivos legítimos y solicitar la eliminación completa de su cuenta."
        },
        {
          type: "paragraph",
          text: "Para ejercer estos derechos o solicitar la supresión definitiva e inmediata de su cuenta y de todos los datos asociados en nuestra base Supabase, envíe una comunicación escrita:"
        },
        {
          type: "bullet_list",
          items: [
            { label: "Por correo a", text: "support@elicine.app o contact@elicine.app", email: "support@elicine.app" },
            { label: "Dato necesario", text: "Indicando la dirección de correo asociada a su cuenta de Google." }
          ]
        },
        {
          type: "paragraph",
          text: "La solicitud será procesada en un plazo máximo de 72 horas hábiles tras su recepción."
        }
      ]
    },
    {
      id: "article-9",
      title: "ARTÍCULO 9: JURISDICCIÓN Y MODIFICACIÓN DE LOS TÉRMINOS",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné se reserva la facultad de adaptar y actualizar los presentes Términos para responder a evoluciones funcionales, técnicas o legales. La versión vigente es la consultable de forma permanente en: https://elicine.app/terms."
        }
      ]
    }
  ]
};
