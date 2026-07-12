"""Validação e normalização de placas brasileiras (formato antigo e Mercosul)."""
import re

# Formato antigo: ABC1234 | Mercosul: ABC1D23
RE_ANTIGA = re.compile(r"^[A-Z]{3}[0-9]{4}$")
RE_MERCOSUL = re.compile(r"^[A-Z]{3}[0-9][A-Z][0-9]{2}$")

# Confusões comuns do OCR, corrigidas conforme a posição esperada do caractere.
PARA_LETRA = {"0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B"}
PARA_DIGITO = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "Z": "2", "A": "4",
               "S": "5", "G": "6", "T": "7", "B": "8"}


def normalizar(texto: str) -> str | None:
    """Limpa a leitura do OCR e tenta encaixá-la em um formato de placa válido.

    Retorna a placa normalizada (ex.: "ABC1D23") ou None se a leitura não
    puder virar uma placa válida.
    """
    bruto = re.sub(r"[^A-Z0-9]", "", texto.upper())
    if len(bruto) != 7:
        return None

    if RE_ANTIGA.match(bruto) or RE_MERCOSUL.match(bruto):
        return bruto

    # Posições 0-2 sempre são letras; posição 3 sempre é dígito.
    chars = list(bruto)
    for i in range(3):
        if chars[i].isdigit():
            chars[i] = PARA_LETRA.get(chars[i], chars[i])
    if chars[3].isalpha():
        chars[3] = PARA_DIGITO.get(chars[3], chars[3])

    # Posições 5-6 são dígitos nos dois formatos; a 4 decide o formato.
    for i in (5, 6):
        if chars[i].isalpha():
            chars[i] = PARA_DIGITO.get(chars[i], chars[i])

    candidato = "".join(chars)
    if RE_ANTIGA.match(candidato) or RE_MERCOSUL.match(candidato):
        return candidato

    # Última tentativa: força a posição 4 para dígito (formato antigo).
    if candidato[4].isalpha():
        chars[4] = PARA_DIGITO.get(chars[4], chars[4])
        candidato = "".join(chars)
        if RE_ANTIGA.match(candidato):
            return candidato

    return None


def formatar(placa: str) -> str:
    """Formata para exibição: ABC1234 -> ABC-1234; Mercosul fica sem hífen."""
    if RE_ANTIGA.match(placa):
        return f"{placa[:3]}-{placa[3:]}"
    return placa
