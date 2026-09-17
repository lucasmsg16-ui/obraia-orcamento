# Passo a passo — inscrições da aula ao vivo (13/10)

**Tempo:** ~8 minutos, uma vez só.
**Resultado:** cada pessoa que preenche `aula-ao-vivo.html` cai automaticamente
numa planilha do Google Sheets, com nome, WhatsApp, e-mail e os dados extras
(atuação, se já usa IA, como conheceu) pra você analisar depois.

Esse é o mesmo esquema que já está rodando na lista de espera do Engenheiro
Dominante da IA — só que numa planilha nova, separada.

---

## PARTE 1 — Criar a planilha nova (1 min)

1. Acesse <https://sheets.new> (abre uma planilha em branco direto)
2. Renomeie para algo como:

   ```
   Inscrições — Aula ao vivo 13-10
   ```

---

## PARTE 2 — Instalar o script (3 min)

1. No menu de cima da planilha: **Extensões → Apps Script**
2. Apague todo o conteúdo que já estiver lá (**Ctrl + A**, **Delete**)
3. Abra o arquivo **`webhook-aula-ao-vivo-Code.gs`** (está na mesma pasta
   deste passo a passo, dentro de `obraia-orcamento`) — pode abrir com o
   **Bloco de Notas**
4. No Bloco de Notas: **Ctrl + A**, depois **Ctrl + C**
5. Volte ao editor do Apps Script, clique na área de código e aperte **Ctrl + V**
6. Aperte **Ctrl + S** para salvar

---

## PARTE 3 — Publicar como Web App (2 min)

1. No canto superior direito do editor, clique em **Implantar → Nova implantação**
2. Ao lado de "Selecionar tipo", clique no ícone de engrenagem ⚙️ e escolha
   **App da Web**
3. Configure assim:
   - **Executar como:** Eu (`seu e-mail`)
   - **Quem pode acessar:** Qualquer pessoa
4. Clique em **Implantar**
5. Vai pedir autorização — clique em **Autorizar acesso**, escolha sua conta
   Google e depois em **Avançado → Acessar [nome do projeto] (não seguro)**
   → **Permitir**

   > A tela de aviso é normal — é o Google avisando que o script é seu,
   > não passou por revisão comercial. Não é vírus.

6. Depois de implantar, aparece uma caixa com **URL do app da Web**. Copie
   esse endereço — ele começa com `https://script.google.com/macros/s/...`
   e termina com `/exec`

---

## PARTE 4 — Ligar a URL na página (1 min)

1. Abra o arquivo **`aula-ao-vivo.html`** (pode ser no Bloco de Notas, ou
   é só me mandar a URL que eu colo pra você)
2. Procure esta linha, perto do fim do arquivo:

   ```js
   const WEBHOOK_URL = "COLE_AQUI_A_URL_DO_WEBHOOK";
   ```

3. Troque `COLE_AQUI_A_URL_DO_WEBHOOK` pela URL que você copiou na Parte 3,
   mantendo as aspas
4. Salve o arquivo

---

## PARTE 5 — Publicar e testar (2 min)

1. Publique `aula-ao-vivo.html` via GitHub Desktop (commit + push), do
   mesmo jeito que você já faz com o resto do site
2. Preencha o formulário com um teste seu (nome, WhatsApp, e-mail e as
   opções extras) e clique em **Garantir minha vaga**
3. Volte na planilha do Google e aperte **F5**

**Como saber que deu certo:** apareceu uma linha nova com Data, Nome,
WhatsApp, E-mail, Atuação, Uso de IA hoje, Como conheceu e Origem preenchidos.

> Não apareceu nada? Espere uns 10 segundos e recarregue de novo — às vezes
> o Google demora um pouco na primeira gravação. Se continuar vazio, confira
> se a URL na Parte 4 foi colada certinha, sem espaço sobrando.

---

## O link que você vai divulgar

Depois de publicado no GitHub, a página fica no ar em:

```
https://app.marabertoeng.com.br/aula-ao-vivo.html
```

É esse o link pra colocar no Instagram, WhatsApp, bio, etc.

---

## Se der problema

| O que aconteceu | O que fazer |
|---|---|
| A planilha não recebe nada | Confira se a URL em `aula-ao-vivo.html` termina em `/exec` e não tem espaço. |
| "Você precisa de permissão" ao testar | Refaça a Parte 3 — provavelmente "Quem pode acessar" não ficou como "Qualquer pessoa". |
| Mudei o script depois | Toda vez que editar o `.gs`, tem que fazer **Implantar → Gerenciar implantações → editar (lápis) → Nova versão → Implantar** — só salvar não atualiza o link publicado. |

---

## Resumo dos arquivos

| Arquivo | Para quê |
|---|---|
| `webhook-aula-ao-vivo-Code.gs` | o script, para colar no Apps Script (Parte 2) |
| `aula-ao-vivo.html` | a página que a pessoa preenche pra se inscrever |

---

*Mar Aberto Engenharia*
