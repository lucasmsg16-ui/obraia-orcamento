#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Atualizador da base SINAPI do ObraIA.

Le os relatorios brutos da CAIXA (exportados em .txt) e regenera os JSONs
que o app realmente consome, em data/:

  - sinapi_<UF>.json        {"codigo": [preco_sem_desoneracao, preco_com_desoneracao]}
                             fonte: SINAPI_Custo_Ref_Composicoes_<UF>_*.txt  (um por estado)

  - composicoes_itens.json  {"codigo": [["I"|"C", "codigo_item", coeficiente], ...]}
                             fonte: SINAPI_Analitico_Ref_Composicoes_*.txt  (nacional, unico)

  - descricoes.json         {"codigo": "descricao da composicao"}
  - unidades.json           {"codigo": "unidade"}
                             fonte: qualquer um dos relatorios de Custo (descricao/unidade
                             sao as mesmas em todo o Brasil, so o preco muda por estado)

  - insumos_desc.json       {"codigo": ["descricao do insumo", "unidade"]}
                             fonte: SINAPI_Preco_Ref_Insumos_<UF>_*.pdf (por estado, mas
                             descricao/unidade sao as mesmas em todo o Brasil; NAO gravamos
                             preco de insumo aqui porque o app nunca le esse campo).
                             Le direto do PDF (nao do .txt) usando a POSICAO (coordenada X)
                             de cada palavra na pagina, via a biblioteca pdfplumber. O .txt
                             exportado desse relatorio embaralha a ordem do texto quando uma
                             descricao e' longa (colunas saem fora de ordem), o que tornava
                             o parser antigo (baseado em texto linear) nao confiavel; usando
                             a posicao real de cada palavra no PDF isso deixa de ser um
                             problema. Requer: pip install pdfplumber.

NAO mexe em: proprios.json (composicoes proprias do usuario).

MODO DE USO (sempre nessa ordem):

  1) Dry-run (não grava nada, só mostra o que mudaria):
     python atualizar_sinapi.py --raw-dir ../sinapi-raw --data-dir ../data

  2) Depois de conferir o relatorio, aplica de verdade (faz backup automatico antes):
     python atualizar_sinapi.py --raw-dir ../sinapi-raw --data-dir ../data --apply
"""

import argparse
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import pdfplumber

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def to_float_br(s):
    """'1.313,38' -> 1313.38 | '172,77' -> 172.77 | '-' / None -> None"""
    if s is None:
        return None
    s = s.strip()
    if s == '' or s == '-':
        return None
    return float(s.replace('.', '').replace(',', '.'))


def to_coef(s):
    """Coeficiente: '8,6200000' -> 8.62 | '2.352,0000000' -> 2352.0 (com separador de milhar)"""
    return float(s.strip().replace('.', '').replace(',', '.'))


def ler_linhas(path):
    return Path(path).read_text(encoding='utf-8', errors='replace').splitlines()


UF_RE = re.compile(r'SINAPI_Custo_Ref_Composicoes_([A-Z]{2})_\d+\.txt$', re.IGNORECASE)
REF_RE = re.compile(r'M[êe]s de Refer[êe]ncia:\s*(\d{2}/\d{4})')


# ---------------------------------------------------------------------------
# Parser do relatorio de CUSTO (por estado)
# ---------------------------------------------------------------------------

HEADER_CUSTO = [
    re.compile(r'^SINAPI - Sistema Nacional de Pesquisa'),
    re.compile(r'^RELAT[ÓO]RIO DE CUSTOS DE COMPOSI[ÇC][ÕO]ES'),
    re.compile(r'^Localidade:'),
    re.compile(r'^Custo Total \(R\$\)$'),
    re.compile(r'^C[óo]digo Descri[çc][ãa]o da Composi[çc][ãa]o Unid\.$'),
    re.compile(r'^SEM desonera[çc][ãa]o %AS COM desonera[çc][ãa]o %AS$'),
    re.compile(r'^INTRODU[ÇC][ÃA]O:$'),
    re.compile(r'^Links externos:$'),
]
GRUPO_RE = re.compile(r'^Grupo .*\(clique para acessar')

DATA_CUSTO_RE = re.compile(
    r'^(\d{3,7})\s+(.*)\s+([A-ZÇÃÕÁÉÍÓÚÂÊÔ0-9]{1,6})\s+'
    r'([\d.,]+|-)\s+(-|\d+(?:,\d+)?%)\s+([\d.,]+|-)\s+(-|\d+(?:,\d+)?%)\s*$'
)


def parse_custo(path):
    """Retorna (precos, descricoes, unidades, suspeitas, ref_mes)"""
    precos, descricoes, unidades = {}, {}, {}
    suspeitas = []
    ref_mes = None
    last_code = None

    for raw in ler_linhas(path):
        line = raw.strip()
        if not line:
            continue
        if ref_mes is None:
            m = REF_RE.search(line)
            if m:
                ref_mes = m.group(1)
        if any(p.match(line) for p in HEADER_CUSTO):
            continue
        if GRUPO_RE.match(line):
            continue

        m = DATA_CUSTO_RE.match(line)
        if m:
            codigo, desc, unid, v1, p1, v2, p2 = m.groups()
            precos[codigo] = [to_float_br(v1), to_float_br(v2)]
            descricoes[codigo] = desc.strip()
            unidades[codigo] = unid
            last_code = codigo
            continue

        # linha nao reconhecida: se comeca com codigo numerico, e suspeita
        # (parece linha de dado que falhou no regex) - nao mexe em nada.
        if re.match(r'^\d{3,7}\s', line):
            suspeitas.append(f'{Path(path).name}: {line[:120]}')
            continue

        # senao, e provavelmente quebra de linha da descricao anterior
        if last_code is not None:
            descricoes[last_code] = (descricoes[last_code] + ' ' + line).strip()

    return precos, descricoes, unidades, suspeitas, ref_mes


# ---------------------------------------------------------------------------
# Parser do relatorio ANALITICO (nacional)
# ---------------------------------------------------------------------------

HEADER_ANALITICO = [
    re.compile(r'^SINAPI - Sistema Nacional de Pesquisa'),
    re.compile(r'^RELAT[ÓO]RIO ANAL[ÍI]TICO DE COMPOSI[ÇC][ÕO]ES'),
    re.compile(r'^C[óo]digo Descri[çc][ãa]o da Composi[çc][ãa]o Unid\. Coeficiente Situa[çc][ãa]o$'),
    re.compile(r'^INTRODU[ÇC][ÃA]O:$'),
    re.compile(r'^Links externos:$'),
]

COMP_RE = re.compile(
    r'^(\d{3,7})\s+(.*)\s+([A-ZÇÃÕÁÉÍÓÚÂÊÔ0-9]{1,6})\s+(COM CUSTO|SEM CUSTO|EM ESTUDO)\s*$'
)
ITEM_RE = re.compile(
    r'^(I|C)\s+(\d{1,7})\s+(.*)\s+([A-ZÇÃÕÁÉÍÓÚÂÊÔ0-9]{1,6})\s+'
    r'([\d.,]+)\s+(COM PRE[ÇC]O|SEM PRE[ÇC]O|COM CUSTO|SEM CUSTO|EM ESTUDO)\s*$'
)


def parse_analitico(path):
    """Retorna (itens, descricoes, unidades, suspeitas, ref_mes)"""
    itens, descricoes, unidades = {}, {}, {}
    suspeitas = []
    ref_mes = None
    last_kind = None
    last_comp = None

    for raw in ler_linhas(path):
        line = raw.strip()
        if not line:
            continue
        if ref_mes is None:
            m = REF_RE.search(line)
            if m:
                ref_mes = m.group(1)
        if any(p.match(line) for p in HEADER_ANALITICO):
            continue
        if GRUPO_RE.match(line):
            continue

        m = COMP_RE.match(line)
        if m:
            codigo, desc, unid, _situacao = m.groups()
            descricoes[codigo] = desc.strip()
            unidades[codigo] = unid
            itens.setdefault(codigo, [])
            last_kind, last_comp = 'comp', codigo
            continue

        m = ITEM_RE.match(line)
        if m and last_comp is not None:
            tipo, cod_item, _desc, _unid, coef, _situacao = m.groups()
            itens[last_comp].append([tipo, cod_item, to_coef(coef)])
            last_kind = 'item'
            continue

        # linha comecando com "I 123..." ou "C 123..." que nao bateu no ITEM_RE,
        # ou comecando com codigo que nao bateu no COMP_RE -> suspeita, nao mexe
        if re.match(r'^(I|C)\s+\d', line) or re.match(r'^\d{3,7}\s', line):
            suspeitas.append(f'{Path(path).name}: {line[:120]}')
            continue

        # quebra de linha de descricao da composicao (nao dos itens, que nao
        # guardamos descricao em composicoes_itens.json)
        if last_kind == 'comp' and last_comp is not None:
            descricoes[last_comp] = (descricoes[last_comp] + ' ' + line).strip()

    return itens, descricoes, unidades, suspeitas, ref_mes


# ---------------------------------------------------------------------------
# Parser do relatorio de PRECOS DE INSUMOS (por estado) — le do PDF, nao do .txt
#
# O .txt exportado desse relatorio embaralha a ordem do texto quando uma
# descricao e' longa (a extracao para .txt junta as colunas fora de ordem),
# entao um parser baseado em texto linear nao consegue confiar no alinhamento
# codigo<->unidade em boa parte das paginas. O PDF original nao tem esse
# problema: cada palavra tem uma posicao (coordenada X, COLUNA) na pagina, e
# essa posicao NAO muda pagina a pagina nem estado a estado (e' sempre o
# mesmo modelo de relatorio). Entao agrupamos palavras por linha (mesma
# coordenada Y) e usamos a coordenada X pra saber a qual coluna cada palavra
# pertence — sem precisar adivinhar pelo formato do texto.
#
# Colunas (coordenada X, em pontos, validado em varios estados e paginas):
#   Codigo Familia:  0-85    (nao usamos, so serve pra confirmar que a linha
#                              e' uma linha de dado, nao cabecalho/rodape)
#   Coeficiente:     85-155  (nao usamos)
#   Codigo Insumo:   155-198
#   Descricao:       198-536
#   Unidade:         536-580
#   Origem / Precos: 580+    (nao usamos - o app nunca le preco de insumo
#                              deste arquivo)
#
# Se uma linha nao tem um codigo de insumo valido (6 digitos) na coluna
# certa, ela e' tratada como continuacao da descricao do codigo anterior
# (linha de texto quebrado) ou ignorada (cabecalho/rodape). Nunca inventamos
# unidade: se a coluna de unidade vier vazia pra um codigo, ele fica de fora
# do resultado (nao grava com unidade errada nem chutada).
# ---------------------------------------------------------------------------

FAMILIA_RE = re.compile(r'^\d{6}$')
COL_FAMILIA = (0, 85)
COL_CODIGO = (155, 198)
COL_DESC = (198, 536)
COL_UNID = (536, 580)


def _agrupa_linhas_por_posicao(words, tolerancia=2.5):
    """Agrupa palavras da pagina em linhas visuais, usando a coordenada Y
    (topo do texto). Palavras da mesma linha impressa tem 'top' bem proximo."""
    linhas = []
    atual = []
    top_atual = None
    for w in sorted(words, key=lambda w: (w['top'], w['x0'])):
        if top_atual is None or abs(w['top'] - top_atual) <= tolerancia:
            atual.append(w)
            top_atual = w['top'] if top_atual is None else top_atual
        else:
            linhas.append(atual)
            atual = [w]
            top_atual = w['top']
    if atual:
        linhas.append(atual)
    return linhas


def _texto_na_coluna(linha, coluna):
    ini, fim = coluna
    return ' '.join(w['text'] for w in linha if ini <= w['x0'] < fim)


def parse_insumos_pdf(path):
    """Retorna (descricoes, unidades, sem_unidade) lendo o PDF de Precos de
    Insumos de um estado. NAO le preco (o app nao usa preco deste arquivo,
    so descricao + unidade)."""
    descricoes = {}
    unidades = {}
    sem_unidade = []

    with pdfplumber.open(path) as pdf:
        for pagina in pdf.pages:
            linhas = _agrupa_linhas_por_posicao(pagina.extract_words())
            last_codigo = None
            for linha in linhas:
                linha.sort(key=lambda w: w['x0'])
                familia_txt = _texto_na_coluna(linha, COL_FAMILIA)
                codigo_txt = _texto_na_coluna(linha, COL_CODIGO)
                desc_txt = _texto_na_coluna(linha, COL_DESC)
                unid_txt = _texto_na_coluna(linha, COL_UNID)

                if FAMILIA_RE.match(familia_txt) and FAMILIA_RE.match(codigo_txt):
                    descricoes[codigo_txt] = desc_txt
                    if unid_txt:
                        unidades[codigo_txt] = unid_txt
                    else:
                        sem_unidade.append(f'{Path(path).name}: código {codigo_txt} sem unidade identificada')
                    last_codigo = codigo_txt
                    continue

                if not familia_txt and not codigo_txt and desc_txt and last_codigo is not None:
                    descricoes[last_codigo] = (descricoes[last_codigo] + ' ' + desc_txt).strip()

    return descricoes, unidades, sem_unidade


# ---------------------------------------------------------------------------
# Orquestracao
# ---------------------------------------------------------------------------

def carregar_json(path):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return {}


def salvar_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def backup(path, backup_dir):
    if path.exists():
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup_dir / path.name)


def resumo_precos(uf, antigo, novo):
    codigos_novo = set(novo)
    codigos_antigo = set(antigo)
    novos = codigos_novo - codigos_antigo
    sumidos = codigos_antigo - codigos_novo
    mudou_muito = []
    for c in codigos_novo & codigos_antigo:
        a = antigo[c][0]
        n = novo[c][0]
        if a and n and a > 0:
            variacao = abs(n - a) / a
            if variacao > 0.30:
                mudou_muito.append((c, a, n, variacao))
    print(f'\n[{uf}] códigos: {len(codigos_novo)} novo total | '
          f'{len(novos)} novos | {len(sumidos)} sumiram | '
          f'{len(mudou_muito)} com variação de preço > 30%')
    if sumidos:
        print(f'  sumiram (existiam antes, não vieram no arquivo novo): {sorted(sumidos)[:15]}'
              f'{" ..." if len(sumidos) > 15 else ""}')
    if mudou_muito:
        print('  maiores variações:')
        for c, a, n, v in sorted(mudou_muito, key=lambda x: -x[3])[:10]:
            print(f'    {c}: R$ {a:.2f} -> R$ {n:.2f}  ({v*100:.0f}%)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw-dir', required=True, help='pasta com os .txt brutos enviados pela CAIXA')
    ap.add_argument('--data-dir', required=True, help='pasta data/ do obraia-orcamento')
    ap.add_argument('--apply', action='store_true', help='grava de verdade (sem isso é só dry-run)')
    args = ap.parse_args()

    raw_dir = Path(args.raw_dir)
    data_dir = Path(args.data_dir)
    if not raw_dir.is_dir():
        sys.exit(f'ERRO: pasta de arquivos brutos não existe: {raw_dir}')
    if not data_dir.is_dir():
        sys.exit(f'ERRO: pasta data/ não existe: {data_dir}')

    backup_dir = data_dir / f'_backup_{datetime.now():%Y%m%d_%H%M%S}'

    todas_suspeitas = []
    ref_mes_encontrada = None

    # --- 1) estados (relatorio de custo) ---
    custo_files = sorted(raw_dir.glob('SINAPI_Custo_Ref_Composicoes_*.txt'))
    if not custo_files:
        print('AVISO: nenhum arquivo SINAPI_Custo_Ref_Composicoes_*.txt encontrado em', raw_dir)

    descricoes_acumuladas = carregar_json(data_dir / 'descricoes.json')
    unidades_acumuladas = carregar_json(data_dir / 'unidades.json')

    for f in custo_files:
        m = UF_RE.search(f.name)
        if not m:
            print(f'AVISO: não consegui identificar o estado pelo nome do arquivo, pulando: {f.name}')
            continue
        uf = m.group(1).upper()

        precos, descricoes, unidades, suspeitas, ref_mes = parse_custo(f)
        todas_suspeitas += suspeitas
        if ref_mes:
            ref_mes_encontrada = ref_mes

        alvo = data_dir / f'sinapi_{uf}.json'
        antigo = carregar_json(alvo)
        resumo_precos(uf, antigo, precos)

        descricoes_acumuladas.update(descricoes)
        unidades_acumuladas.update(unidades)

        if args.apply:
            backup(alvo, backup_dir)
            salvar_json(alvo, precos)
            print(f'  -> gravado {alvo.name} ({len(precos)} códigos)')

    # --- 2) composicoes_itens.json (relatorio analitico nacional) ---
    analitico_files = sorted(raw_dir.glob('SINAPI_Analitico_Ref_Composicoes_*.txt'))
    if len(analitico_files) > 1:
        print(f'AVISO: mais de um arquivo Analítico encontrado, usando o primeiro: {analitico_files[0].name}')
    if analitico_files:
        f = analitico_files[0]
        itens, descricoes, unidades, suspeitas, ref_mes = parse_analitico(f)
        todas_suspeitas += suspeitas
        if ref_mes:
            ref_mes_encontrada = ref_mes

        alvo = data_dir / 'composicoes_itens.json'
        antigo = carregar_json(alvo)
        novos = set(itens) - set(antigo)
        sumidos = set(antigo) - set(itens)
        print(f'\n[composicoes_itens.json] {len(itens)} composições | '
              f'{len(novos)} novas | {len(sumidos)} sumiram')

        descricoes_acumuladas.update(descricoes)
        unidades_acumuladas.update(unidades)

        if args.apply:
            backup(alvo, backup_dir)
            salvar_json(alvo, itens)
            print(f'  -> gravado {alvo.name} ({len(itens)} composições)')
    else:
        print('AVISO: nenhum arquivo SINAPI_Analitico_Ref_Composicoes_*.txt encontrado em', raw_dir)

    # --- 2.5) insumos_desc.json (relatorio de precos de insumos, por estado) ---
    # So descricao + unidade (o app nunca le preco deste arquivo). Le do PDF
    # original (nao do .txt) usando a posicao de cada palavra na pagina -
    # ver comentario em parse_insumos_pdf pra entender por que.
    insumos_files = sorted(raw_dir.glob('SINAPI_Preco_Ref_Insumos_*.pdf'))
    if insumos_files:
        insumos_desc_acumulado = carregar_json(data_dir / 'insumos_desc.json')
        total_desc_antes = len(insumos_desc_acumulado)
        for f in insumos_files:
            desc_i, unid_i, sem_unidade_i = parse_insumos_pdf(f)
            todas_suspeitas += sem_unidade_i
            for codigo, desc in desc_i.items():
                unidade = unid_i.get(codigo)
                if unidade:
                    insumos_desc_acumulado[codigo] = [desc, unidade]
                elif codigo not in insumos_desc_acumulado:
                    # sem unidade confiável nesta pagina e ainda nao temos
                    # esse codigo de outra fonte -> nao inventa unidade, pula
                    continue
        novos_insumos = len(insumos_desc_acumulado) - total_desc_antes
        print(f'\n[insumos_desc.json] {len(insumos_desc_acumulado)} insumos no total '
              f'({novos_insumos:+d} em relação ao que já existia)')
        if args.apply:
            backup(data_dir / 'insumos_desc.json', backup_dir)
            salvar_json(data_dir / 'insumos_desc.json', insumos_desc_acumulado)
            print(f'  -> gravado insumos_desc.json ({len(insumos_desc_acumulado)} códigos)')
    else:
        print('AVISO: nenhum arquivo SINAPI_Preco_Ref_Insumos_*.pdf encontrado em', raw_dir,
              '(insumos_desc.json não será tocado)')

    # --- 3) descricoes.json / unidades.json (acumulado de todos os arquivos lidos) ---
    if args.apply:
        backup(data_dir / 'descricoes.json', backup_dir)
        backup(data_dir / 'unidades.json', backup_dir)
        salvar_json(data_dir / 'descricoes.json', descricoes_acumuladas)
        salvar_json(data_dir / 'unidades.json', unidades_acumuladas)
        print(f'\n-> gravado descricoes.json ({len(descricoes_acumuladas)} códigos)')
        print(f'-> gravado unidades.json ({len(unidades_acumuladas)} códigos)')

    # --- 4) meta ---
    if ref_mes_encontrada:
        print(f'\nReferência encontrada nos arquivos: {ref_mes_encontrada}')
        meta_path = data_dir / 'sinapi_meta.json'
        meta = carregar_json(meta_path)
        if meta.get('referencia') != ref_mes_encontrada:
            print(f'  sinapi_meta.json atual diz "{meta.get("referencia")}" -> seria atualizado para "{ref_mes_encontrada}"')
            if args.apply:
                backup(meta_path, backup_dir)
                mes, ano = ref_mes_encontrada.split('/')
                meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                         'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
                meta['referencia'] = ref_mes_encontrada
                meta['referencia_extenso'] = f'{meses[int(mes)]} de {ano}'
                meta['atualizado_em'] = datetime.now().strftime('%Y-%m-%d')
                salvar_json(meta_path, meta)
                print('  -> sinapi_meta.json atualizado')

    # --- 5) suspeitas (linhas que pareciam dado mas não bateram no parser) ---
    if todas_suspeitas:
        print(f'\n*** ATENÇÃO: {len(todas_suspeitas)} linha(s) suspeita(s) não reconhecida(s) '
              f'(pareciam linha de dado mas o parser não entendeu o formato — NÃO foram aplicadas) ***')
        for s in todas_suspeitas[:30]:
            print('  ' + s)
        if len(todas_suspeitas) > 30:
            print(f'  ... e mais {len(todas_suspeitas) - 30}')
        print('\nRevise essas linhas antes de confiar 100% no resultado.')
    else:
        print('\nNenhuma linha suspeita encontrada.')

    if args.apply:
        print(f'\nBackup do estado anterior salvo em: {backup_dir}')
        print('CONCLUÍDO. Confira os arquivos em data/ e depois publique via GitHub Desktop.')
    else:
        print('\n(Dry-run — nada foi gravado. Rode de novo com --apply quando estiver satisfeito com o resumo acima.)')


if __name__ == '__main__':
    main()
