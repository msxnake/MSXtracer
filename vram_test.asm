; -----------------------------------------------------------------------------
; VRAM RANDOM FILL TEST
; Purpose: Verify LDIRVM works correctly for RAM->VRAM copies and check VDP Viewer
; -----------------------------------------------------------------------------

; BIOS CALLS
CHGMOD: equ 0x005F ; Change Video Mode (A=Mode)
WRTVDP: equ 0x0047 ; Write VDP Register (C=Reg, B=Data)
LDIRVM: equ 0x005C ; Block transfer RAM -> VRAM
DISSBR: equ 0x0041 ; Disable Interrupts

; VRAM ADDRESSES (SCREEN 2)
NAMTR2: equ 0x1800 ; Name Table Base
PGTTR2: equ 0x0000 ; Pattern Table Base
COLTR2: equ 0x2000 ; Color Table Base

; RAM VARIABLES
org 0xC000
seed: db 0xAA      ; Random seed
buffer: ds 256     ; 256-byte buffer for random data

; ROM HEADER
org 0x4000
db "AB"
dw start
dw 0, 0, 0, 0, 0, 0

start:
    call DISSBR         ; Disable interrupts

    ; 1. Set Screen 2
    ld a, 2
    call CHGMOD

    ; 2. Configure VDP for 3 Banks (Screen 2 Full Mode)
    ; Reg 4: Pattern Generator Table Base = 0x0000
    ld b, 0x03
    ld c, 4
    call WRTVDP
    
    ; Reg 3: Color Table Base = 0x2000
    ld b, 0xFF
    ld c, 3
    call WRTVDP

    ; 3. Main Loop: Continuously fill VRAM
fill_loop:
    ; A. Generate 256 bytes of random data in RAM buffer
    ld hl, buffer
    ld b, 0             ; 256 iterations (B=0 loops 256 times)
rnd_gen:
    ld a, (seed)        ; Get seed
    rlca                ; Rotate left
    rlca
    xor 0x1D            ; Xor with magic number
    add a, b            ; Mix with counter
    ld (seed), a        ; Update seed
    ld (hl), a          ; Store in buffer
    inc hl
    djnz rnd_gen

    ; B. Copy Buffer to VRAM
    ; We'll copy this 256-byte buffer to several places to fill the screen
    
    ; -- FILL PATTERNS (0x0000 - 0x1800) --
    ; Copy 256 bytes multiple times to fill 6KB? 
    ; Let's just fill the first 2KB (Bank 1) roughly
    ld ix, 8            ; Repeat 8 times (8 * 256 = 2048 bytes)
    ld de, PGTTR2       ; Destination: 0x0000
loop_pgt:
    push de
    ld hl, buffer
    ld bc, 256
    call LDIRVM         ; Copy RAM(buffer) -> VRAM(DE)
    pop de
    inc d               ; DE += 256 (d is heavy byte, d+1 = +256)
    dec ix
    ld a, ixh
    or ixl
    jr nz, loop_pgt

    ; -- FILL COLORS (0x2000 - 0x3800) --
    ld ix, 8            ; Repeat 8 times
    ld de, COLTR2       ; Destination: 0x2000
loop_col:
    push de
    ld hl, buffer
    ld bc, 256
    call LDIRVM
    pop de
    inc d
    dec ix
    ld a, ixh
    or ixl
    jr nz, loop_col

    ; -- FILL NAME TABLE (0x1800 - 0x1AFF) --
    ; 768 bytes = 3 blocks of 256
    ld de, NAMTR2
    ld b, 3             ; 3 blocks
loop_nam:
    push bc
    push de
    ld hl, buffer
    ld bc, 256
    call LDIRVM
    pop de
    inc d               ; Advance 256 bytes
    pop bc
    djnz loop_nam

    ; Infinite loop to verify static image, 
    ; or jump back to fill_loop for animated noise
    jp fill_loop        ; Animated noise!
