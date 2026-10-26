# contexto-tokens

Mod de Claude Code: en el pie del prompt, a la derecha, una columna con cuánto contexto lleva acumulado la conversación.

```
contexto
████░░░░░░
 42%
 84k/200k
```

- **Barra y porcentaje**: tokens que se reenvían en la siguiente petición sobre la ventana de contexto del modelo, las mismas cifras que usa la línea de estado de Claude Code.
- **Colores**: verde hasta el 70 %, ámbar con «alto» desde el 70 % y rojo con «⚠ compacta pronto» desde el 85 %.
- **Cuarta fila**: tokens usados / tamaño de la ventana.
- Se ve siempre, entre turnos y durante ellos. No aparece hasta la primera respuesta de la sesión, cuando aún no hay nada medido, y tras compactar desaparece hasta la siguiente respuesta por el mismo motivo.

Se actualiza al terminar cada turno, tras cada herramienta, al compactar y cada 10 s. Leer el uso no consume tokens.

## Convivencia con otros mods

El mod dibuja su columna delante de lo que ya hay a la derecha del pie (las etiquetas de modo de Claude Code y lo que añadan otros mods) y lo conserva entero, separado por ` · ` solo cuando hay algo al lado. Su formato (etiqueta, barra, porcentaje, detalle) coincide con el de un mod de uso de suscripción que muestre las ventanas de 5 h y semanal, para que las columnas queden alineadas.

## Instalación

En el prompt de una sesión de terminal:

```
/plugin install contexto-tokens --marketplace wkielw2/claude-context-count
```

Desde una shell:

```sh
claude plugin install contexto-tokens --marketplace wkielw2/claude-context-count
```

En la app de escritorio, donde `/plugin` no funciona: pulsa + junto al cuadro del prompt, luego Plugins, Add marketplace con `wkielw2/claude-context-count` y después Add plugin.

## Desarrollo

```sh
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

El último arranca una sesión con el mod cargado desde esta carpeta.

- `hooks/context.ts`: formato puro (tokens compactos, barra, nivel y aviso).
- `hooks/register.tsx`: lee el uso con `$.session.usage()`, lo guarda en `$.state` solo si la medida ha cambiado y dibuja la columna en el componente `SessionMode`.
- `types/index.d.ts`: contrato del estado (`contexto-tokens.fill`).
- `tests/context.test.ts`: 6 tests del formato (kit `claude-code/testing`).
- `tests/register.test.tsx`: 16 tests del registro de hooks con un motor simulado: render con y sin medida, conservación del árbol de `next(e)`, separador solo con algo al lado, colores por nivel y umbrales (70 y 85 %), refresco cada 10 s y tras `tool.call`, `turn.complete` y `session.compact`, fallo de lectura y escrituras de estado.

`claude plugin test .` ejecuta los 22 tests (6 + 16).

### Comprobación de tipos

`tsc -p .` solo funciona después de que Claude Code haya cargado el mod, porque es entonces cuando genera `.claude-plugin/types/` (ignorado por git). Cárgalo antes, por ejemplo con `claude --plugin-dir .`. Si lo ejecutas antes, falla y además emite archivos `.js` (están en `.gitignore`; bórralos).

## Licencia

[MIT](LICENSE).
