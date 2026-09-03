# Passo a passo — planilha da lista de espera (Engenheiro Dominante da IA)

**Tempo:** ~8 minutos, uma vez só.
**Resultado:** cada pessoa que preenche `lista-espera.html` cai automaticamente
na planilha **Lista de Espera — Engenheiro Dominante da IA** — a mesma que
você já criou e que já tem 3 cadastros reais nela hoje.

> Atualizado: conferi direto no seu Google Drive e o webhook já escreve
> nessa planilha corretamente — não é preciso criar nem trocar de planilha.
> A única mudança pendente é a coluna "Faixa de preço": o script agora
> corrige o cabeçalho sozinho na primeira execução depois da atualização,
> sem apagar os 3 cadastros que já estão lá. Só falta você republicar a
> versão nova do script (Parte 6) — isso eu não consigo fazer sozinho,
> porque o acesso ao seu Drive só me deixa ler/mover arquivos, não editar
> ou implantar código do Apps Script.

---

## PARTE 1 — Criar a planilha nova (1 min)

1. Acesse <https://sheets.new> (abre uma planilha em branco direto)
2. Clique no nome **"Planilha sem título"** lá em cima e renomeie para:

   ```
   Lista de Espera — Engenheiro Dominante da IA
   ```

---

## PARTE 2 — Instalar o script (3 min)

1. No menu de cima da planilha: **Extensões → Apps Script**
2. Abre uma aba nova com o editor de código. Já existe um arquivo
   **`Código.gs`** com um trecho parecido com isto:

   ```
   function myFunction() {

   }
   ```

3. Clique dentro da área de código, aperte **Ctrl + A** (seleciona tudo) e
   depois **Delete** — a área tem que ficar totalmente vazia
4. Abra o arquivo **`webhook-lista-espera-Code.gs`** (está na mesma pasta
   deste passo a passo, dentro de `obraia-orcamento`) — pode abrir com o
   **Bloco de Notas**
5. No Bloco de Notas: **Ctrl + A**, depois **Ctrl + C**
6. Volte ao editor do Apps Script, clique na área de código e aperte **Ctrl + V**
7. Aperte **Ctrl + S** para salvar (dá pra deixar o nome do projeto como está)

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

1. Abra o arquivo **`lista-espera.html`** (pode ser no Bloco de Notas ou
   direto comigo, é só me mandar a URL que eu colo)
2. Procure esta linha, perto do fim do arquivo:

   ```js
   const WEBHOOK_URL = "COLE_AQUI_A_URL_DO_WEBHOOK";
   ```

3. Troque `COLE_AQUI_A_URL_DO_WEBHOOK` pela URL que você copiou na Parte 3,
   mantendo as aspas. Deve ficar assim:

   ```js
   const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   ```

4. Salve o arquivo

---

## PARTE 5 — O teste (1 min)

1. Abra `lista-espera.html` no navegador (localmente ou já publicado)
2. Preencha nome e e-mail com um teste seu e clique em **Entrar na lista
   de espera**
3. Volte na planilha do Google e aperte **F5**

**Como saber que deu certo:** apareceu uma linha nova com Data, Nome,
E-mail, WhatsApp e Origem preenchidos.

> Não apareceu nada? Espere uns 10 segundos e recarregue de novo — às vezes
> o Google demora um pouco na primeira gravação. Se continuar vazio, confira
> se a URL na Parte 4 foi colada certinha, sem espaço sobrando.

---

## PARTE 6 — Atualizar o script (2 min)

Isso é o que você precisa fazer **agora**. Só salvar o código novo (Ctrl+S)
não é suficiente — o link publicado (`/exec`) continua servindo a versão
antiga até você fizer isto:

1. Abra a planilha **Lista de Espera — Engenheiro Dominante da IA** (a que
   já tem os 3 cadastros) e vá em **Extensões → Apps Script**
2. Apague todo o conteúdo do arquivo do script (**Ctrl + A**, **Delete**)
3. Abra **`webhook-lista-espera-Code.gs`** de novo (mesma pasta de sempre,
   dentro de `obraia-orcamento`) — o conteúdo mudou, então copie tudo de
   novo: **Ctrl + A**, **Ctrl + C**
4. Volte ao editor do Apps Script, cole (**Ctrl + V**) e salve (**Ctrl + S**)
5. **Implantar → Gerenciar implantações**
6. Clique no ícone de **lápis (editar)** na implantação que já existe
7. Em **Versão**, escolha **Nova versão** → **Implantar**

**Como saber que deu certo:** a caixa mostra a mesma **URL do app da Web**
de antes — ela não muda, só a versão por trás dela é atualizada. Não
precisa trocar nada em `lista-espera.html`.

8. Teste: abra `lista-espera.html`, preencha um cadastro de teste escolhendo
   uma faixa de valor, e confira na planilha se veio uma coluna nova
   **Faixa de preço** (inserida automaticamente antes de "Origem") com a
   linha de teste preenchida — e que os 3 cadastros antigos continuam lá,
   só com essa coluna em branco.

---

## Se der problema

| O que aconteceu | O que fazer |
|---|---|
| A planilha não recebe nada | Confira se a URL em `lista-espera.html` termina em `/exec` e não tem espaço. |
| "Você precisa de permissão" ao testar | Refaça a Parte 3 — provavelmente "Quem pode acessar" não ficou como "Qualquer pessoa". |
| Mudei o script depois | Toda vez que editar o `.gs`, tem que fazer **Implantar → Gerenciar implantações → editar (lápis) → Nova versão → Implantar** — só salvar não atualiza o link publicado. |

---

## Resumo dos arquivos

| Arquivo | Para quê |
|---|---|
| `webhook-lista-espera-Code.gs` | o script, para colar no Apps Script (Parte 2) |
| `lista-espera.html` | a página que a pessoa preenche — já linkada no botão "entrar na lista de espera" do `link.html` |

---

*Mar Aberto Engenharia*
