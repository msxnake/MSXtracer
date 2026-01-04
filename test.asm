        org     0x4000

        db      "AB"
        dw      start
        dw      0, 0, 0, 0, 0

; --- BIOS Y CONSTANTES ---
CHGMOD  equ     0x005F
WRTVRM  equ     0x004D
LDIRVM  equ     0x005C
FILVRM  equ     0x0056
WRTVDP  equ     0x0047
GTSTCK  equ     0x00D5

SPR_PAT  equ    0x3800
SPR_ATTR equ    0x1B00
MAX_X    equ    240
MAX_Y    equ    176

start:
        di
        ; 1. Establecer Screen 2
        ld      a,2
        call    CHGMOD

        ; 3. Limpiar patrón de sprites (importante!)
        ld      hl, SPR_PAT
        ld      a, 0
        ld      bc, 2048     ; 2048 bytes para patrones de sprite
        call    FILVRM



        ; 6. Cargar patrón del sprite
        ld      hl, sprite_pattern
        ld      de, SPR_PAT
        ld      bc, 32
        call    LDIRVM

        ; 7. Configurar sprite 0
        ld      hl, SPR_ATTR
        ld      a, 96        ; Y inicial (centro vertical)
        ld      (sprite_y), a
        call    WRTVRM
        inc     hl
        
        ld      a, 120       ; X inicial (centro horizontal)
        ld      (sprite_x), a
        call    WRTVRM
        inc     hl
        
        ld      a, 0         ; Patrón 0
        call    WRTVRM
        inc     hl
        
        ld      a, 15        ; Color blanco
        call    WRTVRM

        ei

main_loop:
        ; Leer joystick 1 (muchos emuladores mapean cursores aqui)
        ld      a, 1
        call    GTSTCK
        ld      b, a

        ; Reiniciar flags de movimiento
        ld      hl, 0

        ; --- Lógica de movimiento ---
check_up:
        ld      a, b
        cp      1
        jr      z, do_up
        cp      2
        jr      z, do_up
        cp      8
        jr      nz, check_down
do_up:
        ld      a, (sprite_y)
        cp      1
        jr      c, check_down
        dec     a
        ld      (sprite_y), a
        jr      update_position

check_down:
        ld      a, b
        cp      5
        jr      z, do_down
        cp      4
        jr      z, do_down
        cp      6
        jr      nz, check_left
do_down:
        ld      a, (sprite_y)
        cp      MAX_Y-16
        jr      nc, check_left
        inc     a
        ld      (sprite_y), a
        jr      update_position

check_left:
        ld      a, b
        cp      7
        jr      z, do_left
        cp      6
        jr      z, do_left
        cp      8
        jr      nz, check_right
do_left:
        ld      a, (sprite_x)
        cp      1
        jr      c, check_right
        dec     a
        ld      (sprite_x), a
        jr      update_position

check_right:
        ld      a, b
        cp      3
        jr      z, do_right
        cp      2
        jr      z, do_right
        cp      4
        jr      nz, update_position
do_right:
        ld      a, (sprite_x)
        cp      MAX_X-16
        jr      nc, update_position
        inc     a
        ld      (sprite_x), a

update_position:
        ; Actualizar posición en VRAM
        ld      hl, SPR_ATTR
        ld      a, (sprite_y)
        call    WRTVRM
        inc     hl
        ld      a, (sprite_x)
        call    WRTVRM

        halt
        jp      main_loop

; --- DATOS ---
sprite_x:   db 120
sprite_y:   db 96

; Patrón de sprite 16x16 más visible (cuadrado)
sprite_pattern:
        ; Parte izquierda (8x16)
        db %11111111, %11111111
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        
        ; Parte derecha (8x16)
        db %11111111, %11111111
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001
        db %10000000, %00000001

        ; Rellenar hasta 16K
        ds 0x8000 - ($ - 0x4000)
