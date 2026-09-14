# PLAZA — red social local experimental sin cuentas

Una red social que funciona **sin cuentas, sin perfiles y sin servidores de terceros**: la corres en tu máquina, y la identidad es una *máscara* que cualquiera puede llevar. El experimento: si cualquiera puede llamarse igual que tú, ¿qué queda de la identidad? La respuesta de PLAZA: **la huella**.

## Qué es

PLAZA es una plaza de pueblo digital local:

- **Sin cuentas**: publicar, dar like o seguir solo requiere un *nombre* (la máscara) y una *clave* secreta.
- **La huella**: tu clave nunca se guarda. Solo se guarda `sha256('foot:' + clave)` (8 caracteres), que llamamos la *huella*. Posts, likes y seguimientos llevan la huella de quien los hizo, invisible a simple vista pero verificable.
- **La máscara es frágil** (cualquiera usa tu nombre), **la huella es la identidad**: si cambias de nombre mantienes tu historial; si compartes tu clave, cualquiera puede usar tu huella.
- **Auditoría total**: cada acción (post, like, follow) se añade a un registro público **append-only encadenado por SHA-256**. Cada evento referencia el hash del anterior; alterar un dato rompe toda la cadena y se detecta al instante. No hay borrado silencioso.
- **La reputación se mueve**: el ranking pondera los likes con **decaimiento temporal** (la atención es un recurso perecedero), y las tendencias miden qué etiquetas despegan.

## Por qué existe

Las redes actuales te obligan a ser "alguien" (cuenta, perfil, followers). La pregunta de PLAZA es: **¿y si la identidad fuera un hecho, no una cuenta?** Lo que pruebas aquí, en local, con tu gente: qué pasa cuando el nombre es una máscara desechable, la reputación es una prueba criptográfica y nadie puede borrar el pasado. Es un laboratorio social, no una red para publicar en producción.

## Características

- Registro append-only encadenado por SHA-256 con verificación de integridad (sin dependencias).
- Identidad = máscara + huella (la clave nunca se persiste; autoría verificable sin revelarla).
- Posts, hilos (respuestas anidadas con profundidad), likes con deduplicación por huella, seguimientos.
- Feed reciente + ranking con decaimiento de atención; feed "para ti" por seguidos.
- Tendencias por ventana temporal; búsqueda por texto y por `#etiqueta`.
- Estado social *derivado siempre* de re-ejecutar el registro: determinista y auditable.
- CLI + servidor local + interfaz web sin dependencias.
- `sembrar`: actividad de demostración para arrancar con vida.

## Instalación

Sin dependencias: requiere Node.js (CLI/servidor/tests) y un navegador.

```bash
git init
```

## Uso

### Servidor + interfaz web

```bash
node server.js
# Abre http://localhost:4848
```

Define máscara y clave en el cuadro de publicar (se recuerdan en tu navegador) y prueba: publicar, responder, dar ♥, seguir, `Para ti`, `Mis posts`, tendencias y el mapa con la cadena íntegra.

### CLI

```bash
node cli.js sembrar                       # actividad de demostración
node cli.js muro top 5                    # feed ranking
node cli.js para-ti --nombre Luis --clave k-luis
node cli.js hilo <id>                     # conversación completa
node cli.js publicar "hola #plaza" --nombre Luis --clave k-luis
node cli.js gusta <id> --nombre Mara --clave k-mara
node cli.js seguir Aurora --nombre Tim --clave k-tim
node cli.js tendencias 48
node cli.js tema plaza
node cli.js verificar Aurora --clave k-aurora    # prueba de autoría
node cli.js estado                                # conteos + ¿cadena íntegra?
```

El registro vive en `plaza.jsonl` (configurable con `PLAZA_FILE`); el puerto con `PLAZA_PORT`.

## Arquitectura

```
js/core/
  chain.js     ← EventLog: registro append-only encadenado por SHA-256, huellas, verificación de integridad
  social.js    ← SocialHub: estado (posts/hilos/likes/follows) SIEMPRE derivado del registro; feeds, ranking, tendencias, búsqueda
cli.js         ← CLI
server.js      ← http local: API + estáticos
js/web.js      ← interfaz web
index.html
tests/
  chain.test.js   ← 6 pruebas (integridad, manipulación detectada, persistencia, huellas)
  social.test.js  ← 10 pruebas (hilos, hashtags, likes dedup, ranking+decaimiento, feeds, tendencias, búsqueda, estado, determinismo)
```

El estado es una **función pura del registro**: reconstruir un hub desde el archivo reda exactamente el mismo feed. Es la misma apuesta del laboratorio: núcleo puro y auditable + interfaz desechable.

## Ejemplo real

```
$ node cli.js para-ti --nombre Luis --clave k-luis
PARA TI · sigues a: Aurora
   Aurora        [hace 2 h]  #c024ce2bb89c
      Pruébalo: publicar, gusta, seguir, hilo, tendencias. Todo local. #experimento
      ♥ 4 · 0 respuestas
$ node cli.js estado
   Eventos:    23
   Cadena:     ÍNTEGRA · 23 hashes encadenados
```

## Notas de honradez

- Esto **no es anonimato**: la clave es una contraseña compartible; si la revelas, cualquiera puede usar tu huella. Es un experimento de identidad portátil, no un sistema criptográfico de anonimato.
- El registro no tiene borrado: es la característica, no un bug. Piensa dos veces antes de publicar algo sensible con una clave real.

## Estado

- Núcleo, CLI, servidor y web funcionales (16 pruebas).
- Feed reciente/ranking con decaimiento, "para ti" por seguidos, hilos con profundidad, tendencias, verificación de autoría, integridad de cadena en vivo en la UI.
- Pendientes: mensajes directos cifrados, edición/borrado ético (marcas de retractación en cadena), rate-limit y moderación mínima, federación entre dos plazas (sincronizar registros), métrica de "reputación de huella".

## Licencia

MIT