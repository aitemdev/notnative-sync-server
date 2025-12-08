# Vim Editor – Cheat Sheet / Hoja de atajos

> Dentro del VimEditor (CodeMirror + vim mode). PC usa `Ctrl`, macOS usa `Cmd` para los atajos globales (guardar/AI) mencionados en `KEYBINDINGS.md`. // Inside VimEditor (CodeMirror + vim mode). PC uses `Ctrl`, macOS uses `Cmd` for global save/AI shortcuts in `KEYBINDINGS.md`.

## English
- **Modes**: `Esc` Normal; `i`/`a`/`I`/`A`/`o`/`O` enter Insert in different spots; `v` Visual char, `V` Visual line, `Ctrl+v` block/column.
- **Navigation**: `h/j/k/l`; `w` `e` `b` next/end/prev word; `0` `^` `$` line start/first non-space/end; `gg` / `G` to top/bottom; `{` / `}` prev/next paragraph; `%` matching bracket; `fX` / `tX` jump to/before next `X`, repeat with `;` / `,`.
- **Select**: all `ggVG`; word `viw`/`vaw`; line `V`; block `Ctrl+v` + arrows; paragraph `vip`/`vap`; sentence `vis`/`vas` (`(`/`)` to move sentences).
- **Edit/Delete/Copy**: `x`/`X` delete char; `dw`/`db`/`de` delete word forward/back/to end; `dd` cut line; `D` delete to line end; `cc` change line; `C` change to line end; `cw` change word; `yy` yank line; `yw` yank word; `y$` yank to line end; `p`/`P` paste after/before; `u` undo; `Ctrl+r` redo; `J` join next line.
- **Indent/Format**: `>>` / `<<` indent/unindent line; in Visual `>` / `<` indent selection; `=` auto-indent selection; `gg=G` re-indent whole file.
- **Search**: `/text` then `Enter` forward, `?text` backward; `n`/`N` next/prev; `*`/`#` word under cursor forward/back.
- **Replace helpers**: use change ops (`cw`, `ciw`, `cip`, `cis`) or AI bubble with `Ctrl/Cmd+K` on a selection.
- **Macros/Repeat**: `.` repeat last action; `q{reg}` … `q` record macro; `@{reg}` play (basic macros supported).
- **Ex commands**: `:w`, `:q`, `:wq`; `:preview` toggles view (same as `Ctrl+E`); `:q`/`:e` are placeholders logging only today.
- **Files/Images**: paste (`Ctrl/Cmd+V`) or drag a file to insert Markdown link/image (50MB limit, executables blocked).
- **Quick tips**: repeat with `.`; combine text-objects `ciw`/`cip`/`cis`; `gg=G` to tidy indentation.

## Español
- **Modos**: `Esc` Normal; `i`/`a`/`I`/`A`/`o`/`O` entran a Insert en distintas posiciones; `v` Visual por caracteres, `V` Visual de línea, `Ctrl+v` bloque/columna.
- **Navegación**: `h/j/k/l`; `w` `e` `b` siguiente/fin/anterior palabra; `0` `^` `$` inicio/primer no-espacio/fin de línea; `gg` / `G` al inicio/final; `{` / `}` párrafo anterior/siguiente; `%` par de paréntesis/llave; `fX` / `tX` salta a/antes de la siguiente `X`, repite con `;` / `,`.
- **Seleccionar**: todo `ggVG`; palabra `viw`/`vaw`; línea `V`; bloque `Ctrl+v` + cursores; párrafo `vip`/`vap`; frase `vis`/`vas` (`(`/`)` para moverte por frases).
- **Editar/Eliminar/Copiar**: `x`/`X` borra carácter; `dw`/`db`/`de` borra palabra adelante/atrás/hasta fin; `dd` corta línea; `D` borra hasta fin; `cc` cambia línea; `C` cambia hasta fin; `cw` cambia palabra; `yy` copia línea; `yw` copia palabra; `y$` copia hasta fin; `p`/`P` pega después/antes; `u` deshace; `Ctrl+r` rehace; `J` une con la siguiente línea.
- **Indentación/Formato**: `>>` / `<<` indenta/desindenta línea; en Visual `>` / `<` indenta/desindenta selección; `=` auto-indenta selección; `gg=G` reindenta todo.
- **Búsqueda**: `/texto` + `Enter` hacia adelante, `?texto` hacia atrás; `n`/`N` siguiente/anterior; `*`/`#` palabra bajo el cursor adelante/atrás.
- **Reemplazo ligero**: usa cambios `cw`/`ciw`/`cip`/`cis` o el bubble AI con `Ctrl/Cmd+K` sobre la selección.
- **Macros/Repetición**: `.` repite la última acción; `q{reg}` … `q` graba macro; `@{reg}` la ejecuta (macros básicas soportadas).
- **Comandos Ex**: `:w`, `:q`, `:wq`; `:preview` alterna vista (igual `Ctrl+E`); `:q`/`:e` hoy solo registran la acción.
- **Archivos/Imágenes**: pega (`Ctrl/Cmd+V`) o arrastra un archivo para insertar enlace/imagen Markdown (límite 50MB, ejecutables bloqueados).
- **Tips**: repite con `.`; combina objetos de texto `ciw`/`cip`/`cis`; `gg=G` para limpiar indentación.
