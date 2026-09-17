# Como atualizar a base SINAPI do ObraIA (via Claude Code)

O sandbox de execução de código aqui no Cowork continua fora do ar (bug do
Windows de 8/set, ainda sem previsão). O Claude Code no seu computador não é
afetado, então o caminho é rodar por lá. Já deixei tudo pronto: só falta
você mover os arquivos e rodar dois comandos.

## O que já está pronto

- `scripts/atualizar_sinapi.py` — o conversor. Já sei exatamente o formato
  dos dois relatórios (testei manualmente linha por linha nos arquivos que
  você mandou) e o script tem modo de teste (dry-run) + backup automático
  antes de sobrescrever qualquer coisa.
- Mapeei exatamente o que cada JSON em `data/` significa e de qual relatório
  ele vem — isso já está embutido no script.

## Passo 1 — Colocar os arquivos brutos na pasta certa (2 min)

Dentro de `obraia-orcamento`, crie uma pasta chamada `sinapi-raw` e coloque
lá dentro os arquivos `.txt` que você já tem no computador (os mesmos 19 que
me mandou, mais os que ainda vai mandar depois — AC, AL, AM, AP, BA, CE, DF,
ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ + o Analítico nacional).

Fica assim:

```
obraia-orcamento/
  sinapi-raw/
    SINAPI_Analitico_Ref_Composicoes_202608.txt
    SINAPI_Custo_Ref_Composicoes_AC_202608.txt
    SINAPI_Custo_Ref_Composicoes_AL_202608.txt
    ... (todos os outros estados)
```

## Passo 2 — Abrir o Claude Code nessa pasta

Abra o Claude Code apontando para `obraia-orcamento`.

## Passo 3 — Colar este prompt no Claude Code

```
Preciso rodar um script já pronto que atualiza a base de preços SINAPI do
ObraIA. NÃO escreva um parser novo — use exatamente o script que já existe
em scripts/atualizar_sinapi.py.

1. Rode primeiro em modo dry-run (sem --apply):
   python scripts/atualizar_sinapi.py --raw-dir sinapi-raw --data-dir data

2. Me mostre o resumo completo que o script imprimiu (quantos códigos por
   estado, quantos sumiram, quantas variações de preço > 30%, e a lista de
   "linhas suspeitas" no final).

3. Antes de aplicar, confira estes casos conhecidos no resultado do dry-run
   (eu já validei manualmente que é isso que tem que dar):
   - Composição 104658 (piso podotátil) no estado CE deve dar preço
     [172.77, 170.07]
   - Composição 104658 em composicoes_itens.json deve conter exatamente:
     I 34353 (8.62), I 34357 (0.24), I 36178 (6.4375), C 88309 (0.639),
     C 88316 (1.279)
   - Insumo 000001 (ACETILENO - RECARGA DE GAS PARA CILINDRO) em
     insumos_desc.json deve ter unidade "KG"
   - Insumo 000002 (OXIGENIO - RECARGA DE GAS PARA CILINDRO) em
     insumos_desc.json deve ter unidade "M3"
   Se algum desses casos não bater, PARE e me avise antes de aplicar
   qualquer coisa — tem algo errado no parsing.

4. O relatório de insumos (SINAPI_Preco_Ref_Insumos_*.txt) tem um formato
   bem mais frágil que os outros dois — o script já lida com isso descartando
   (e reportando em "suspeitas") qualquer página onde a contagem não fechar,
   em vez de adivinhar. É normal aparecer bem mais "suspeitas" vindas desses
   arquivos do que dos outros dois relatórios — isso é o script sendo
   conservador, não um sinal de erro generalizado. Só me avise se a proporção
   parecer absurda (tipo mais da metade das páginas descartadas).

5. Se bateu e o resumo geral parece razoável (sem quantidade absurda de
   "linhas suspeitas" nem estados com metade dos códigos sumindo), rode
   com --apply:
   python scripts/atualizar_sinapi.py --raw-dir sinapi-raw --data-dir data --apply

6. O script já faz backup automático de tudo que sobrescreve, numa pasta
   data/_backup_<data>. Não apague essa pasta.

7. NÃO mexa em data/proprios.json — o script já não toca nele, mantenha assim.

8. Não faça commit nem push sozinho — eu confiro os arquivos primeiro e
   publico manualmente pelo GitHub Desktop.
```

## Passo 4 — Depois que o Claude Code aplicar

1. Dê uma conferida rápida nos arquivos `data/sinapi_*.json` e
   `data/composicoes_itens.json` que mudaram (o Git/GitHub Desktop mostra
   quais mudaram)
2. Publique via GitHub Desktop (commit + push), do jeito que você já faz
   sempre
3. Me avisa que publicou — eu confiro ao vivo no site se quiser

## Importante sobre os estados que faltam

Esse relatório de Custo é por estado — então só os estados cujo `.txt`
estiver dentro de `sinapi-raw/` são atualizados. RN, RO, RR, SC, SE, SP e TO
continuam com o preço antigo até você mandar os arquivos deles e rodar o
script de novo (pode rodar quantas vezes quiser, sempre com backup).

Já a `composicoes_itens.json`, `descricoes.json`, `unidades.json` e
`insumos_desc.json` são as mesmas em todo o Brasil — são atualizadas de uma
vez só com os arquivos que você já tem, mesmo que falte algum estado no
relatório de Custo.
