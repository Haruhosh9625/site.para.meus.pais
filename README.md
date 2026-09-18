# DS Espetos

Sistema web completo para a espetaria **DS Espetos**: cardápio, carrinho,
contas de cliente, pedidos, pagamento por PIX, acompanhamento de status e
painel administrativo. Pensado primeiro para o celular.

---

## Índice

1. [O que já vem funcionando](#o-que-já-vem-funcionando)
2. [Sistema visual](#sistema-visual)
3. [Stack](#stack)
4. [Instalação](#instalação)
5. [Configuração do `.env`](#configuração-do-env)
6. [Banco de dados](#banco-de-dados)
7. [Administrador](#administrador)
8. [Supabase: banco e login](#supabase-banco-e-login)
9. [Agendamento de retirada](#agendamento-de-retirada)
10. [Gateway de pagamento](#gateway-de-pagamento)
11. [Webhooks](#webhooks)
12. [Rodando localmente](#rodando-localmente)
13. [Testes](#testes)
14. [Deploy](#deploy)
15. [Backup e restauração](#backup-e-restauração)
16. [Estrutura do projeto](#estrutura-do-projeto)
17. [Rotas de API](#rotas-de-api)
18. [Como o dinheiro é tratado](#como-o-dinheiro-é-tratado)
19. [Segurança](#segurança)
20. [Como estender](#como-estender)

---

## O que já vem funcionando

**Cliente**

- Página inicial com estado aberto/fechado em tempo real.
- Cardápio com foto, descrição, preço e controle `+` / `−` por item.
- **Gaveta do carrinho**: abre por cima do cardápio, confere e ajusta o
  pedido sem sair da página. Fecha no Esc ou clicando fora, devolve o foco
  ao botão que a abriu, e os valores são os mesmos de `/api/cart/quote`.
- Carrinho com preço unitário e subtotal por linha, taxa de entrega,
  desconto e total — **tudo recalculado no servidor**.
- **Perguntas frequentes** montadas a partir das configurações reais
  (horário, formas de pagamento, regras de agendamento, endereço): mexer no
  painel muda a resposta na hora, sem texto inventado no código.
- Cadastro, login, logout, recuperação e troca de senha — pelo
  **Supabase Auth**, com a senha fora deste banco.
- Endereços salvos, edição de dados pessoais, histórico de pedidos.
- **Agendamento da retirada**: o cliente digita a hora em que vai buscar
  (hora livre), com sugestões de horários que ainda têm vaga; o servidor
  confere expediente, antecedência mínima e lotação da janela.
- Remarcação da retirada pelo próprio cliente, enquanto o preparo não
  começou.
- Checkout em uma página: horário da retirada, PIX / cartão / dinheiro,
  cálculo de troco, observações.
- Pagamento PIX com código copia-e-cola (BR Code EMV válido).
- Acompanhamento do pedido com atualização automática a cada 10 s.
- Comprovante imprimível (e "salvar como PDF" pelo próprio navegador).

**Administrador** (`/admin`)

- Dashboard com faturamento, pedidos, ticket médio, fila de produção,
  gráfico de 14 dias, divisão por forma de pagamento e mais vendidos.
- **Agenda do dia** (`/admin/agenda`): pedidos agrupados por janela de
  horário, com carga de cada faixa, aviso de janela lotada e recarga
  automática — é a tela que fica aberta no balcão.
- Gestão de pedidos com filtros (período, status, pagamento, recebimento),
  busca, mudança de status, cancelamento e impressão.
- CRUD do cardápio, com disponibilidade e upload de foto.
- Clientes com métricas de compra (sem nunca expor senha).
- Financeiro por período, com bruto, líquido, cancelamentos e reembolsos.
- Cupons de desconto funcionais.
- Configurações: horários, aberto/fechado, **regras de agendamento**
  (antecedência mínima, tamanho da janela, pedidos por janela, dias de
  antecedência), taxa de entrega, pedido mínimo, bairros atendidos, tempos
  e formas de pagamento aceitas.

**Infra**

- **Supabase**: PostgreSQL para os dados e Supabase Auth para o login, com
  a API REST pública do banco trancada (RLS sem policies + privilégios
  revogados).
- Pagamento confirmado apenas pelo backend, via webhook assinado com
  reconsulta do status no gateway.
- Idempotência em pedidos e em eventos de webhook.
- Log de auditoria de eventos sensíveis.
- Rate limiting persistido no banco.

---

## Sistema visual

A identidade é **brasa**: preto frio de base, amarelo da marca e tipografia
de cartaz. Três materiais, e a diferença entre eles não é estética — é de
desempenho:

| Classe        | O que é                                   | Onde usar |
| ------------- | ----------------------------------------- | --------- |
| `.glass`      | Vidro de verdade: desfoca o que está atrás | Peças que **flutuam** sobre conteúdo que rola — barra do topo, navegação de baixo, barras de ação, pastilhas sobre foto |
| `.panel`      | Mesmo material, translúcido, **sem** desfoque | Peças **paradas** no fluxo — cartão de produto, formulário, resumo do pedido |
| `.mesh`       | Malha de brasa sobre preto frio            | Herói, chamada final, rodapé |

**Por que a separação existe.** `backdrop-filter` obriga o navegador a
promover a peça a uma camada de composição própria e refazer o desfoque a
cada quadro de rolagem. Uma barra fixa faz isso bem; vinte cartões de
cardápio fazem o celular de entrada engasgar. Medido nesta página: 13
camadas de desfoque simultâneas antes da separação, 6 depois — e 2 fora do
herói, depois que as pastilhas de preço (uma por cartão) também deixaram o
desfoque de lado.

**Vidro só parece vidro quando há algo atrás para refratar.** Sobre branco
chapado, `backdrop-filter` não produz nada visível. Por isso toda tela do
cliente tem `.wash` (lavagem de gradiente) atrás e as seções escuras usam
`.mesh`. Não é enfeite: é o que dá substância ao material.

**Tipografia.** `Anton` para os títulos (condensada, caixa alta, tracking
fechado — a classe `.display`) e `Archivo` para tudo que se lê de perto.
As duas vêm por `next/font`, que as baixa no build e serve do nosso
domínio: nenhum pedido a terceiro no carregamento e nada de CLS.

**Acessibilidade do vidro.** Quem liga *reduzir transparência* no sistema
recebe superfícies chapadas (`prefers-reduced-transparency`), e quem pede
menos animação não vê entrada por scroll nem reflexo. O contraste do texto
sobre vidro foi medido em pixel, nos dois temas — a medição encontrou um
rótulo em 3,5:1 no herói, que foi corrigido para 5,8:1.

**Imagem de compartilhamento.** `src/app/opengraph-image.tsx` desenha em
código a figura que aparece quando o link vai para o WhatsApp. Sai do banco
(nome da loja, modo de retirada), então nunca fica desatualizada.

### Movimento

Tudo que se move vive em dois lugares: as regras em `globals.css` (bloco
`MOVIMENTO`) e os quatro comportamentos de `components/site/motion.tsx`
(entrada por scroll, brilho do cursor, inclinação 3D e barra de progresso).
Ficam juntos de propósito: cada `pointermove` e cada `scroll` escreve no DOM
uma vez por quadro, dentro de um `requestAnimationFrame` só.

| Peça                       | O que faz                                                           |
| -------------------------- | ------------------------------------------------------------------- |
| `.reveal`                  | Entra deslizando quando alcança a tela, em cascata dentro do grupo   |
| `.spotlight` / `[data-spotlight]` | Clarão que acompanha o cursor sobre a peça                   |
| `.tilt` / `[data-tilt]`    | Inclinação em perspectiva; a força vem do próprio atributo           |
| `.fagulha`                 | Brasa subindo no herói — 12 pontos com ritmo próprio cada            |
| `.scroll-progress`         | Fio de progresso no topo, alimentado pela variável `--progresso`     |
| `.sanfona`                 | Perguntas frequentes com altura animada de verdade                   |
| `.gaveta`                  | Carrinho deslizando pela direita, com foco preso e Esc para fechar   |
| `.pulo`                    | O selo do carrinho salta quando a quantidade muda                    |

**Uma propriedade para cada efeito.** `.reveal` escreve em `translate`,
`.lift` em `translate`, `.tilt` em `transform`. Não é preciosismo: os três
podem cair no mesmo elemento, e enquanto todos usavam `transform` o último
da cascata apagava os outros — `.reveal.is-in` (0-2-0) vencia `.tilt`
(0-1-0) e as molduras do herói não se mexiam, embora o JavaScript estivesse
escrevendo `--rx`/`--ry` corretamente. `translate` e `rotate` são
propriedades independentes e compõem com `transform`.

**Números que contam.** `components/site/numbers.tsx` tem três peças:
`ValorAnimado` (dinheiro que anda até o valor novo), `NumeroNaTela`
(estatística que sobe de zero quando a faixa aparece) e `Pulo`. Nenhuma
delas calcula nada: o valor é sempre o que o servidor mandou, e a animação
só percorre o caminho até ele. O HTML do servidor já traz o número cheio —
quem está sem JavaScript, quem usa leitor de tela e o robô de busca leem o
valor certo, nunca um zero.

**Nada disso é obrigatório.** Com `prefers-reduced-motion: reduce` as
fagulhas param, a inclinação desliga, a gaveta abre sem deslizar, a entrada
por scroll não acontece e os números aparecem prontos. O brilho e a
inclinação também só ligam em ponteiro fino com hover — num celular
disparariam no toque e a peça ficaria torta depois de o dedo sair.

---

## Stack

| Camada        | Escolha                                    |
| ------------- | ------------------------------------------ |
| Frontend      | Next.js 15 (App Router), React 19, TypeScript |
| Estilo        | Tailwind CSS v4                            |
| Backend       | Route Handlers do Next.js (Node runtime)   |
| Banco         | PostgreSQL 14+ (Supabase em produção)      |
| ORM           | Prisma 6                                   |
| Autenticação  | Supabase Auth (`@supabase/ssr`), atrás de um contrato trocável |
| Senhas        | guardadas pelo Supabase; no modo local, scrypt (`node:crypto`) |
| CSRF          | token assinado (HMAC) + checagem de origem |
| Validação     | Zod                                        |
| Pagamentos    | Gateway configurável por variável de ambiente |

Fora de Next, Prisma, Zod e do cliente do Supabase, nada mais: os gráficos
são SVG escritos à mão, o PIX é gerado localmente e o QR/impressão usam
recursos do navegador.

---

## Instalação

Pré-requisitos: **Node.js 20+** e **PostgreSQL 14+**.

```bash
git clone <url-do-repositorio>
cd site.para.meus.pais
npm install
```

---

## Configuração do `.env`

```bash
cp .env.example .env
```

Depois abra o `.env` e preencha. O mínimo para subir:

```dotenv
DATABASE_URL="postgresql://usuario:senha@localhost:5432/dsespetos?schema=public"
SESSION_SECRET="<openssl rand -base64 48>"
APP_URL="http://localhost:3000"
PAYMENT_PROVIDER="manual"
```

Gerando os segredos:

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -hex 32      # MANUAL_WEBHOOK_SECRET
```

O `.env.example` documenta cada variável, de onde tirar cada credencial e o
que acontece se ela faltar. Nenhum segredo é exposto ao navegador: tudo é
lido em `src/server/env.ts`, que só roda no servidor.

---

## Banco de dados

**Criar o banco:**

```bash
createdb dsespetos
# ou, via psql:
psql -U postgres -c "CREATE DATABASE dsespetos;"
psql -U postgres -c "CREATE USER dsespetos WITH PASSWORD 'sua-senha';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE dsespetos TO dsespetos;"
```

**Migrations:**

```bash
npm run db:deploy     # produção — aplica as migrations existentes
npm run db:migrate    # desenvolvimento — cria migration a partir do schema
```

**Seed** (idempotente; pode rodar quantas vezes quiser):

```bash
npm run db:seed
```

Cria as categorias, o cardápio inicial e as configurações:

| Produto                      | Categoria        | Preço     |
| ---------------------------- | ---------------- | --------- |
| Espeto de Porco              | Espetos          | R$ 8,00   |
| Espeto de Carne              | Espetos          | R$ 8,00   |
| Espeto de Toscana            | Espetos          | R$ 8,00   |
| Espeto de Frango             | Espetos          | R$ 8,00   |
| Espeto de Frango com Bacon   | Espetos          | R$ 8,00   |
| Refrigerante 1 litro         | Bebidas          | R$ 10,00  |
| Completo                     | Acompanhamentos  | R$ 12,00  |

O **Completo é um produto independente**: ele não acompanha o espeto e é
adicionado ao carrinho separadamente.

Rodar o seed de novo **não sobrescreve** preços que o administrador já
tenha ajustado no painel — apenas cria o que ainda não existe.

**Outros comandos úteis:**

```bash
npm run db:studio     # navegador visual do banco (Prisma Studio)
npm run db:generate   # regenera o Prisma Client
```

---

## Administrador

Não existe senha de administrador embutida no código. Duas formas de criar:

**1. Interativa (recomendada em produção)**

```bash
npm run admin:create
```

A senha é digitada no terminal sem eco: não vai para o histórico do shell
nem para nenhum arquivo. Exige no mínimo 10 caracteres, com letras e
números.

**2. Pelo seed (útil em CI/automação)**

Defina no `.env` e rode `npm run db:seed`:

```dotenv
SEED_ADMIN_EMAIL="voce@exemplo.com"
SEED_ADMIN_PASSWORD="uma-senha-forte-de-verdade"
```

Sem `SEED_ADMIN_PASSWORD`, o seed avisa e segue sem criar administrador.

Se o e-mail já existir como cliente, ele é **promovido** a `ADMIN` sem
alterar a senha. Para redefinir a senha de um admin existente, use
`npm run admin:create` e confirme quando ele perguntar.

> Depois do primeiro acesso, troque a senha em **Minha conta → Senha**. Isso
> encerra todas as outras sessões abertas.

---

## Supabase: banco e login

O Supabase entra em dois papéis, e os dois são configuração — não código.

### 1. Banco de dados

É um PostgreSQL comum. O Prisma fala com ele pela senha do banco, do mesmo
jeito que falaria com qualquer outro Postgres. Duas strings de conexão, em
*Project Settings → Database → Connection string*:

| Variável       | Qual usar                        | Para quê                   |
| -------------- | -------------------------------- | -------------------------- |
| `DATABASE_URL` | a do **pooler** (porta 6543)     | a aplicação                |
| `DIRECT_URL`   | a **direta** (porta 5432)        | as migrations              |

O pooler existe porque em servidor sem estado (Vercel) cada requisição
abriria uma conexão nova e o banco esgotaria o limite. Migrations precisam
da direta: o pooler não executa DDL.

```bash
npm run db:deploy   # aplica as migrations
npm run db:seed     # cardápio e configurações iniciais
```

**A API REST do Supabase fica trancada.** O mesmo banco também é servido
por uma API automática (PostgREST) que atende com a chave publicável — a
que vai para o navegador de qualquer visitante. A migration
`fecha_api_publica` liga RLS em todas as tabelas **sem nenhuma policy** e
revoga os privilégios dos papéis `anon` e `authenticated`. Para eles, tudo
é negado; o Prisma, que se conecta como dono das tabelas, passa por cima de
RLS e não sente diferença (a suíte end-to-end passa igual com a tranca
aplicada). Sem isso, quem tivesse a chave publicável leria `users`,
`orders` e `payments` direto, por cima de toda a autorização da aplicação.

### 2. Login (Supabase Auth)

O Supabase guarda a credencial, faz o hash da senha e envia os e-mails de
confirmação e de redefinição. **A senha nunca passa por este banco** —
`users.password_hash` fica nulo.

O que continua sendo desta aplicação: o perfil, os endereços, os pedidos e
o **papel** (`CUSTOMER` / `ADMIN`). O papel é lido sempre da tabela `users`,
nunca de dentro do JWT: um token adulterado não vira administrador.

Tudo passa pelas rotas `/api/auth/*` desta aplicação, e não direto do
navegador para o Supabase. É o que mantém em pé o limite de tentativas de
login, o log de auditoria e a criação da linha de `users` na mesma
requisição.

**Variáveis:**

```bash
SUPABASE_URL="https://<ref>.supabase.co"    # Project Settings > Data API
SUPABASE_PUBLISHABLE_KEY="sb_publishable_…" # Project Settings > API Keys
AUTH_PROVIDER=""                            # vazio = supabase, quando as duas acima existem
```

A chave publicável é **pública por natureza** — em qualquer aplicação
Supabase ela vai para o navegador. Não dá permissão nenhuma no banco (ver
a tranca acima). A chave **service_role não é usada** por este projeto:
nenhum fluxo precisa dela, e quanto menos segredo em circulação, melhor.

**No painel do Supabase, configure:**

1. *Authentication → URL Configuration*
   - Site URL: `https://seu-dominio.com`
   - Redirect URLs: `https://seu-dominio.com/redefinir-senha` e
     `https://seu-dominio.com/login`

   Sem isso o link de redefinição de senha não volta para o site.

2. *Authentication → Sign In / Providers → Email* — a chave **Confirm
   email**. Ligada, o cadastro exige o clique no e-mail antes do primeiro
   acesso (a tela de cadastro já trata esse caso e mostra "Confirme seu
   e-mail"). Desligada, o cliente entra na hora.

3. *Project Settings → Authentication → SMTP Settings* — **obrigatório em
   produção**. O servidor de e-mail padrão do Supabase é limitado a poucas
   mensagens por hora e serve só para teste. Sem SMTP próprio (Resend,
   SendGrid, SES, Brevo…), confirmação de e-mail e redefinição de senha não
   chegam ao cliente.

### O administrador com o Supabase

A senha mora no Supabase, então nenhum script daqui pode criá-la. O caminho
é a pessoa escolher a própria senha:

```bash
# 1. a pessoa cria a conta no site, em /cadastro
# 2. promova essa conta:
ADMIN_EMAIL=dono@exemplo.com npm run admin:create
```

Sai melhor assim: a senha nunca passa por um script, por um arquivo nem
pelo histórico do shell.

### O provedor local

`AUTH_PROVIDER=local` guarda a senha neste banco, com hash scrypt e tabela
de sessões. Serve para desenvolvimento e para `npm run test:e2e` rodar sem
depender de rede ou de credencial externa.

**Em produção o modo local não entra por descuido.** Se as variáveis do
Supabase forem esquecidas no provedor de hospedagem, a aplicação derruba a
requisição com uma mensagem clara em vez de voltar a guardar senhas no banco
sem ninguém perceber. Para usá-lo em produção de propósito, declare
`AUTH_PROVIDER=local`.

Trocar de provedor é trocar uma variável: quem decide é
`src/server/identity/index.ts`, e nenhuma tela ou rota conhece o provedor
ativo. O painel mostra qual está em uso em `/api/admin/settings`
(`identityProvider`), sem expor chave nenhuma.

---

## Agendamento de retirada

A DS Espetos **ainda não entrega**: todo pedido é retirada com hora marcada.
O cliente digita a hora em que vai buscar e a cozinha prepara para aquele
horário.

**Como a hora é escolhida.** Hora livre: o campo aceita qualquer horário.
A tela oferece as próximas janelas com vaga como atalho, mas nada impede
digitar 19:07. Quem decide se o horário vale é sempre o servidor, em
`src/server/services/scheduling.ts` — a tela só adianta a resposta para o
cliente não montar o pedido inteiro e tomar erro no final.

**As três perguntas de cada horário:**

1. cai dentro do expediente daquele dia? (inclusive quando o expediente
   atravessa a madrugada — 18:00 às 02:00);
2. respeita a antecedência mínima? (a cozinha precisa de tempo);
3. ainda há vaga na janela?

**Configuração** (painel, em `/admin/configuracoes` → *Agendamento de
retirada*):

| Campo                     | O que faz                                          | Padrão |
| ------------------------- | -------------------------------------------------- | ------ |
| Antecedência mínima (min) | Tempo entre agendar e retirar                       | 30     |
| Tamanho da janela (min)   | De quanto em quanto tempo a agenda é dividida       | 30     |
| Pedidos por janela        | Quantos cabem em cada janela — **0 = sem limite**   | 0      |
| Dias de antecedência      | Até quando dá para agendar — **0 = somente hoje**   | 0      |

As janelas são ancoradas na meia-noite: com 30 minutos, elas são 18:00,
18:30, 19:00... Pedidos **cancelados não ocupam vaga**.

**Fluxo de status:**

```
AWAITING_PAYMENT → PAYMENT_CONFIRMED → SCHEDULED → PREPARING → READY → PICKED_UP
```

O pagamento confirmado é o que garante o horário: o pedido vai direto a
`SCHEDULED` e espera ali a hora marcada. `OUT_FOR_DELIVERY` e `DELIVERED`
continuam no enum para o dia em que a entrega for ligada.

**Quando começarem a entregar**, é uma caixa de seleção em
`/admin/configuracoes` (*Aceitar entrega*). As telas do cliente voltam a
oferecer a escolha entre entrega e retirada sozinhas — nenhuma linha de
código muda.

### Fuso horário

O horário de funcionamento e o agendamento são **hora de balcão**: "18:00"
significa 18:00 na loja. O servidor fixa `TZ` (padrão
`America/Sao_Paulo`, em `src/server/env.ts`) para que a conta seja feita
nesse fuso mesmo rodando em uma nuvem que usa UTC. O cliente envia apenas
`"19:30"` e o servidor resolve o dia — assim um celular configurado em
outro fuso não agenda uma hora que não existe no balcão.

Se a loja estiver em outro fuso, declare `TZ` no `.env`.

---

## Gateway de pagamento

O gateway é escolhido por `PAYMENT_PROVIDER`. Trocar de provedor é trocar
essa variável — nenhuma tela, rota ou regra de pedido muda.

### `manual` (padrão)

PIX direto na chave da loja, sem intermediário. O sistema gera um BR Code
EMV válido — qualquer app bancário lê o código copia-e-cola.

```dotenv
PAYMENT_PROVIDER="manual"
PIX_KEY="sua-chave-pix"              # CPF/CNPJ, e-mail, telefone ou aleatória
PIX_RECEIVER_NAME="DS ESPETOS"
PIX_RECEIVER_CITY="SAO PAULO"
MANUAL_WEBHOOK_SECRET="<openssl rand -hex 32>"
```

Como o pagamento é confirmado neste modo:

- **pelo webhook assinado** — se você tem alguma automação lendo o extrato
  do banco, ela chama `/api/webhooks/payments/manual` (formato abaixo); ou
- **pela baixa manual no painel** — em `/admin/pedidos/{id}`, o botão
  "Dar baixa no pagamento". A ação exige sessão de administrador e fica
  registrada no log de auditoria com o autor.

### `mercadopago`

```dotenv
PAYMENT_PROVIDER="mercadopago"
MERCADOPAGO_ACCESS_TOKEN="APP_USR-..."      # Suas integrações → Credenciais
MERCADOPAGO_WEBHOOK_SECRET="..."            # Webhooks → Assinatura secreta
```

Cobra PIX por `POST /v1/payments`. Confirma validando a assinatura HMAC do
cabeçalho `x-signature` e reconsultando `GET /v1/payments/{id}`.

### `stripe`

```dotenv
PAYMENT_PROVIDER="stripe"
STRIPE_SECRET_KEY="sk_live_..."             # Developers → API keys
STRIPE_WEBHOOK_SECRET="whsec_..."           # Developers → Webhooks
```

Usa Checkout Session. O método PIX precisa estar habilitado na conta
brasileira. Assinatura verificada pelo cabeçalho `Stripe-Signature`.

### `asaas`

```dotenv
PAYMENT_PROVIDER="asaas"
ASAAS_API_KEY="..."                         # Integrações → Chave de API
ASAAS_WEBHOOK_TOKEN="..."                   # token definido no webhook
ASAAS_BASE_URL="https://api.asaas.com/v3"   # sandbox: api-sandbox.asaas.com/v3
```

### `pagbank`

```dotenv
PAYMENT_PROVIDER="pagbank"
PAGBANK_TOKEN="..."
PAGBANK_WEBHOOK_TOKEN="..."
PAGBANK_BASE_URL="https://api.pagseguro.com"
```

> **Regra que vale para todos:** o pagamento nunca é confirmado pelo corpo do
> webhook. Nos gateways com API, o backend valida a assinatura, reconsulta o
> status server-to-server e compara o valor cobrado antes de liberar o
> pedido. O cliente voltar para a página ou clicar em "já paguei" não muda
> nada.

---

## Webhooks

Cadastre no painel do gateway:

```
https://SEU-DOMINIO/api/webhooks/payments/{provider}
```

Onde `{provider}` é `mercadopago`, `stripe`, `asaas`, `pagbank` ou `manual`.

O endpoint aceita `GET` (alguns gateways validam a URL antes de ativar) e
`POST` para os eventos.

**Códigos de resposta:**

| Situação                              | Resposta |
| ------------------------------------- | -------- |
| Evento processado / já processado      | `200`    |
| Assinatura ausente ou inválida         | `401`    |
| Corpo inválido                         | `400`    |
| Segredo do webhook não configurado     | `503`    |
| Falha nossa (banco fora, por exemplo)  | `500` — o gateway deve tentar de novo |

**Testando o webhook manual:**

```bash
SECRET="valor-de-MANUAL_WEBHOOK_SECRET"
# O paymentId é o providerPaymentId do pagamento — para o provedor manual,
# "manual_<id-do-pedido>".
BODY='{"eventId":"evt-1","paymentId":"manual_ABC123","status":"paid"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

curl -X POST http://localhost:3000/api/webhooks/payments/manual \
  -H "content-type: application/json" \
  -H "x-signature: $SIG" \
  -d "$BODY"
```

Reenviar o mesmo `eventId` responde `200` mas não reprocessa nada: a tabela
`webhook_events` tem chave única em `(provider, event_id)`.

---

## Rodando localmente

```bash
npm run dev      # desenvolvimento, em http://localhost:3000
```

Produção local:

```bash
npm run build
npm start
```

Outros comandos:

```bash
npm run typecheck   # TypeScript, sem emitir arquivos
npm run lint        # ESLint
npm run test:e2e    # teste end-to-end (exige a aplicação rodando)
```

---

## Testes

O projeto tem um teste end-to-end que roda contra uma instância **real** da
aplicação, batendo nas mesmas rotas HTTP que o navegador usa. Nada é
simulado.

```bash
# terminal 1
npm run dev

# terminal 2
npm run test:e2e
```

Cobre 200 verificações, entre elas:

- cardápio, preços do seed e o Completo como item independente;
- cálculo no servidor, incluindo a tentativa de enviar preço adulterado;
- cadastro, login, logout, hash da senha, CSRF e checagem de origem;
- controle de acesso: cliente comum recebe 403 nas rotas de admin;
- criação de pedido, idempotência de clique duplo, cálculo de troco;
- agendamento: horário fora do expediente recusado, antecedência mínima,
  horizonte de dias, janela lotada, vaga devolvida ao cancelar e
  remarcação pelo próprio cliente;
- geração do PIX, webhook com assinatura errada (recusado) e com
  assinatura correta (confirma e avança o status);
- reenvio do mesmo evento de webhook sem duplicar pagamento;
- máquina de estados: tentar pular etapas é bloqueado;
- CRUD de produtos, incluindo a desativação (em vez de exclusão) de um
  produto já vendido;
- clientes, financeiro, cupons, configurações e loja fechada;
- rate limiting, SQL injection, XSS, JSON inválido e 404;
- renderização real das páginas e do dashboard.

O teste é idempotente: ele limpa os dados que cria e restaura as
configurações que altera. Ele também lê o fuso da loja em `/api/schedule` e
envia os horários nesse fuso — de propósito, porque é assim que se comporta
um cliente cujo celular está em outro fuso.

---

## Deploy

### Requisitos

- Node.js 20+
- PostgreSQL acessível pela aplicação
- HTTPS (obrigatório: os cookies de sessão usam `Secure` em produção)

### Passos

```bash
# 1. variáveis de ambiente no provedor (nunca no repositório)
#    DATABASE_URL, SESSION_SECRET, APP_URL, PAYMENT_PROVIDER + credenciais

# 2. migrations
npm run db:deploy

# 3. seed (na primeira vez)
npm run db:seed

# 4. administrador
npm run admin:create

# 5. build e start
npm run build
npm start
```

### Vercel

O projeto roda sem ajustes. Duas observações:

- **Upload de imagens:** o disco é efêmero. Use `ENABLE_UPLOADS="false"` e
  informe a URL de uma imagem hospedada (S3, R2, Cloudinary) no campo de
  foto do produto.
- **Banco:** use um Postgres gerenciado (Neon, Supabase, RDS) e prefira a
  string de conexão com pool. Acrescente `?sslmode=require` quando o
  provedor exigir.

Rode as migrations no deploy — em `package.json`, `build` já executa
`prisma generate`; adicione `prisma migrate deploy` ao comando de build do
provedor se quiser que ele aplique migrations automaticamente.

### Docker / VPS

```bash
npm ci --omit=dev
npm run db:deploy
npm run build
npm start                        # ou por trás de um gerenciador de processos
```

Coloque um proxy reverso (nginx, Caddy) na frente com TLS e
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` — o rate
limiting usa esse cabeçalho para identificar o IP do cliente.

### Depois de publicar

Entre em `/admin/configuracoes` e preencha:

- telefone, WhatsApp e endereço da loja;
- horário de funcionamento de cada dia;
- taxa de entrega, pedido mínimo e tempos estimados;
- bairros atendidos, se as taxas variam por região;
- formas de pagamento aceitas.

Nada disso está no código: é tudo configuração.

---

## Backup e restauração

**Backup:**

```bash
pg_dump --format=custom --no-owner --no-privileges \
  "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M).dump
```

**Restauração:**

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$DATABASE_URL" backup-20260907-1200.dump
```

**Backup diário automático** (crontab, 3h da manhã, guardando 14 dias):

```cron
0 3 * * * pg_dump --format=custom --no-owner "$DATABASE_URL" \
  > /var/backups/dsespetos/$(date +\%Y\%m\%d).dump \
  && find /var/backups/dsespetos -name '*.dump' -mtime +14 -delete
```

Guarde as imagens enviadas junto (`public/uploads/`) — elas não estão no
banco. Se estiver em Vercel ou outro ambiente efêmero, use armazenamento
externo desde o início.

---

## Estrutura do projeto

```
prisma/
  schema.prisma            Modelo de dados (money em centavos, snapshots)
  migrations/              Migrations versionadas
  seed.ts                  Cardápio inicial, configurações e admin

scripts/
  create-admin.ts          Criação segura do administrador
  smoke-test.ts            Teste end-to-end (200 verificações)

src/
  middleware.ts            Primeiro filtro das páginas /admin

  lib/                     Código que roda nos dois lados
    money.ts               Centavos: formatar, converter, percentual
    constants.ts           Rótulos de status, fluxos, cores de gráfico
    cx.ts                  Junta classes CSS (os dois lados usam)
    format.ts              Datas, telefone, CEP, endereço
    api-client.ts          fetch do navegador com token CSRF

  server/                  Apenas servidor (nunca importado pelo cliente)
    env.ts                 Leitura das variáveis de ambiente
    db.ts                  Instância única do Prisma
    password.ts            Hash scrypt e verificação
    tokens.ts              Tokens opacos, hash, HMAC, comparação segura
    auth.ts                Sessão, RBAC, CSRF, IP do cliente
    csrf.ts                Token CSRF assinado (roda também no Edge)
    api.ts                 Envelope de resposta e tratamento de erros
    validation.ts          Schemas Zod de toda entrada
    rate-limit.ts          Janela fixa persistida no banco
    audit.ts               Log de auditoria
    logger.ts              Log estruturado em JSON, com campos censurados
    errors.ts              Erros com status HTTP

    services/
      pricing.ts           MOTOR DE PREÇOS — a fonte da verdade dos valores
      orders.ts            Criação, máquina de estados, cancelamento
      scheduling.ts        AGENDA — única autoridade sobre "esse horário pode?"
      payments.ts          Cobrança, confirmação, processamento de webhook
      settings.ts          Configurações e cálculo de aberto/fechado
      notifications.ts     Notificações e adaptadores de canal
      analytics.ts         Consultas do dashboard e do financeiro
      admin-filters.ts     Filtros de período da área administrativa

    identity/
      types.ts             Contrato IdentityProvider
      index.ts             Escolha do provedor e trava de produção
      supabase.ts          Supabase Auth (produção)
      local.ts             Senha neste banco (desenvolvimento e testes)

    payments/
      types.ts             Contrato PaymentProvider
      index.ts             Registro de gateways
      pix-brcode.ts        Gerador de BR Code EMV (CRC-16/CCITT-FALSE)
      providers/           manual, mercadopago, stripe, asaas, pagbank

  components/
    ui/                    Button, Field, Input, Badge, estados vazios…
    providers/             Sessão, configurações, carrinho, avisos
    site/                  Logo, navegação, cartão de produto, status,
                           escolha do horário de retirada, entrada por scroll
    admin/                 Estrutura do painel e gráficos SVG

  app/
    layout.tsx             Layout raiz, fontes, metadados, providers
    opengraph-image.tsx    Imagem de compartilhamento, desenhada em código
    icon.svg               Ícone da aba
    globals.css            SISTEMA VISUAL — vidro, painel, malha, cartaz
    (site)/                Páginas do cliente
    admin/                 Páginas do administrador
    api/                   Route Handlers

public/
  produtos/                Imagens do cardápio inicial (SVG)
  uploads/                 Fotos enviadas pelo administrador
```

---

## Rotas de API

Toda resposta segue o mesmo envelope:

```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": { "message": "…", "code": "…", "details": { } } }
```

Requisições que alteram estado exigem o cabeçalho `x-csrf-token` com o valor
do cookie `ds_csrf` (o `src/lib/api-client.ts` já faz isso).

### Público

| Método | Rota                    | O que faz                                   |
| ------ | ----------------------- | ------------------------------------------- |
| `GET`  | `/api/settings`         | Configurações públicas e aberto/fechado     |
| `GET`  | `/api/products`         | Cardápio por categoria                      |
| `POST` | `/api/cart/quote`       | **Cotação do carrinho** (preços do servidor) |
| `POST` | `/api/coupons/validate` | Valida um cupom                             |
| `GET`  | `/api/schedule`         | Regras de agendamento e horários com vaga   |
| `POST` | `/api/schedule/check`   | Confere um horário sem criar pedido         |

### Autenticação

| Método | Rota                          | O que faz                        |
| ------ | ----------------------------- | -------------------------------- |
| `POST` | `/api/auth/register`          | Cadastro (abre sessão)           |
| `POST` | `/api/auth/login`             | Login                            |
| `POST` | `/api/auth/logout`            | Logout                           |
| `POST` | `/api/auth/forgot-password`   | Solicita redefinição             |
| `POST` | `/api/auth/reset-password`    | Redefine com o token             |
| `POST` | `/api/auth/change-password`   | Troca a senha (encerra sessões)  |

### Conta do cliente

| Método   | Rota                       | O que faz                    |
| -------- | -------------------------- | ---------------------------- |
| `GET`    | `/api/me`                  | Perfil e endereços           |
| `PATCH`  | `/api/me`                  | Edita dados pessoais         |
| `GET`    | `/api/me/addresses`        | Lista endereços              |
| `POST`   | `/api/me/addresses`        | Cria endereço                |
| `PATCH`  | `/api/me/addresses/{id}`   | Edita endereço               |
| `DELETE` | `/api/me/addresses/{id}`   | Remove (soft delete)         |
| `GET`    | `/api/notifications`       | Avisos do cliente            |
| `POST`   | `/api/notifications`       | Marca como lidos             |

### Pedidos

| Método | Rota                          | O que faz                          |
| ------ | ----------------------------- | ---------------------------------- |
| `GET`  | `/api/orders`                 | Histórico do cliente               |
| `POST` | `/api/orders`                 | Cria pedido (aceita `idempotencyKey`) |
| `GET`  | `/api/orders/{id}`            | Detalhe e status                   |
| `POST` | `/api/orders/{id}/payment`    | Gera nova cobrança                 |
| `POST` | `/api/orders/{id}/cancel`     | Cancela (antes do preparo)         |
| `POST` | `/api/orders/{id}/reschedule` | Remarca a retirada                 |

### Pagamentos

| Método      | Rota                                  | O que faz                     |
| ----------- | ------------------------------------- | ----------------------------- |
| `POST`/`GET`| `/api/webhooks/payments/{provider}`   | Webhook do gateway            |

### Administração (exige `role = ADMIN`)

| Método   | Rota                                        | O que faz                  |
| -------- | ------------------------------------------- | -------------------------- |
| `GET`    | `/api/admin/dashboard`                      | Métricas do dashboard      |
| `GET`    | `/api/admin/agenda`                         | Agenda do dia por janela   |
| `GET`    | `/api/admin/orders`                         | Pedidos com filtros e busca |
| `GET`    | `/api/admin/orders/{id}`                    | Detalhe e transições válidas |
| `POST`   | `/api/admin/orders/{id}/status`             | Altera o status            |
| `POST`   | `/api/admin/orders/{id}/cancel`             | Cancela                    |
| `POST`   | `/api/admin/orders/{id}/confirm-payment`    | Baixa manual do pagamento  |
| `GET`    | `/api/admin/products`                       | Produtos e categorias      |
| `POST`   | `/api/admin/products`                       | Cria produto               |
| `PATCH`  | `/api/admin/products/{id}`                  | Edita produto              |
| `DELETE` | `/api/admin/products/{id}`                  | Exclui ou desativa         |
| `GET`    | `/api/admin/categories`                     | Categorias                 |
| `POST`   | `/api/admin/categories`                     | Cria categoria             |
| `GET`    | `/api/admin/customers`                      | Clientes com métricas      |
| `GET`    | `/api/admin/customers/{id}`                 | Detalhe do cliente         |
| `PATCH`  | `/api/admin/customers/{id}`                 | Ativa/desativa             |
| `GET`    | `/api/admin/finance`                        | Relatório financeiro       |
| `GET`    | `/api/admin/settings`                       | Configurações              |
| `PUT`    | `/api/admin/settings`                       | Salva configurações        |
| `GET`    | `/api/admin/delivery-areas`                 | Bairros atendidos          |
| `POST`   | `/api/admin/delivery-areas`                 | Cria/atualiza bairro       |
| `DELETE` | `/api/admin/delivery-areas/{id}`            | Remove bairro              |
| `GET`    | `/api/admin/coupons`                        | Cupons                     |
| `POST`   | `/api/admin/coupons`                        | Cria cupom                 |
| `PATCH`  | `/api/admin/coupons/{id}`                   | Edita cupom                |
| `DELETE` | `/api/admin/coupons/{id}`                   | Exclui ou desativa         |
| `POST`   | `/api/admin/uploads`                        | Upload de foto             |

### Páginas

**Cliente:** `/` · `/cardapio` · `/carrinho` · `/checkout` · `/login` ·
`/cadastro` · `/recuperar-senha` · `/redefinir-senha` · `/minha-conta` ·
`/meus-pedidos` · `/pedido/{id}` · `/pedido/{id}/comprovante`

**Administrador:** `/admin` · `/admin/pedidos` · `/admin/pedidos/{id}` ·
`/admin/produtos` · `/admin/clientes` · `/admin/financeiro` ·
`/admin/cupons` · `/admin/configuracoes`

---

## Como o dinheiro é tratado

**1. Sempre inteiro, em centavos.** R$ 8,00 é `800`. Nenhum valor monetário
existe como `Float` no banco ou no código. Isso elimina de vez a classe de
bug em que `0.1 + 0.2 !== 0.3` produz um total de R$ 37,999999999.

**2. O navegador nunca informa preço.** O carrinho guarda apenas
`{ productId, quantity }`. Todo valor unitário vem do banco e todas as somas
acontecem em `src/server/services/pricing.ts`. Se alguém adulterar o
`localStorage` ou o corpo da requisição, o total cobrado continua correto —
há um teste automatizado exatamente para isso.

**3. Pedido antigo não muda de valor.** Cada `OrderItem` guarda um
*snapshot* do nome e do preço praticados na compra. Reajustar o cardápio
hoje não altera um centavo dos pedidos de ontem, nem dos relatórios.

**4. Produto vendido nunca é apagado.** A exclusão de um produto que já
aparece em pedidos é convertida em desativação (`active = false`), para o
histórico continuar íntegro. A interface avisa isso antes de confirmar.

Exemplo do cálculo, conferido pelo teste automatizado:

```
2 × Espeto de Carne     R$ 16,00
1 × Completo            R$ 12,00
1 × Refrigerante 1L     R$ 10,00
                        --------
Total                   R$ 38,00
```

---

## Segurança

| Área                  | Como está implementado |
| --------------------- | ---------------------- |
| Senhas                | Guardadas pelo **Supabase Auth** — não passam por este banco (`password_hash` fica nulo). No modo local: scrypt (N=2¹⁵, r=8, p=3), salt aleatório por senha, comparação em tempo constante. Texto puro nunca é gravado nem logado. |
| Sessões               | JWT do Supabase em cookie `httpOnly`, renovado pelo middleware; validado com `getUser()`, que confere a assinatura junto ao servidor de autenticação — um cookie adulterado não passa. No modo local: token opaco de 256 bits, com apenas o SHA-256 no banco. `Secure` em produção, `SameSite=Lax`. |
| Troca de senha        | Exige a senha atual (reautenticação) e derruba todas as sessões, em qualquer aparelho. O aparelho que trocou volta já com a senha nova. |
| Autorização           | Três camadas: middleware (redireciona sem cookie), layout do `/admin` (confere sessão e papel) e `requireAdmin()` em cada rota de API — que é onde os dados realmente estão. O papel vem sempre da tabela `users`, nunca de dentro do JWT. |
| CSRF                  | Token assinado com HMAC do `SESSION_SECRET` (cookie `ds_csrf` + cabeçalho `x-csrf-token`, comparados entre si e verificados na assinatura) **e** conferência de `Origin`/`Referer` em toda requisição que altera estado. Havendo sessão, o token é obrigatório — suprimir o cookie não passa livre. |
| API REST do banco     | A API automática do Supabase (PostgREST) responde com a chave publicável, que é pública. A migration `fecha_api_publica` liga RLS em todas as tabelas **sem policies** e revoga os privilégios de `anon` e `authenticated`: para eles tudo é negado. O Prisma se conecta como dono das tabelas e passa por cima de RLS. |
| Chave de serviço      | **Não é usada.** Nenhum fluxo precisa da `service_role`, e ela não é lida em lugar nenhum do código. |
| SQL injection         | Prisma com queries parametrizadas. O único SQL cru (rate limit) usa parâmetros. |
| XSS                   | React escapa por padrão; nenhum `dangerouslySetInnerHTML` no projeto. Uploads de SVG com `<script>` são rejeitados. CSP restritiva nos cabeçalhos. |
| Validação             | Zod em toda entrada, no servidor. O frontend valida também, para dar retorno rápido — mas a decisão é sempre do servidor. |
| Rate limiting         | Persistido no banco (funciona com várias instâncias). Login, cadastro, recuperação de senha, criação de pedido, cupons e webhooks. |
| Webhooks              | Assinatura HMAC/token obrigatória; idempotência por `(provider, event_id)`; status reconsultado no gateway e valor comparado. |
| Idempotência          | Pedidos aceitam `idempotencyKey` única; eventos de webhook não reprocessam. |
| Logs                  | JSON estruturado com campos sensíveis censurados (senha, token, chave, assinatura). Tabela `audit_logs` para eventos relevantes. |
| Segredos              | Só em variáveis de ambiente, lidos em `src/server/env.ts`. Nenhuma variável `NEXT_PUBLIC_*` com credencial. |
| Cabeçalhos            | HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| Senha de cliente      | Nem o administrador consegue ver senha ou hash: os `select` da área admin são explícitos e não incluem esses campos. |

Papéis: `CUSTOMER` e `ADMIN`. Somente `ADMIN` acessa o painel e as rotas
`/api/admin/*`.

---

## Como estender

**Ligar notificação por WhatsApp ou e-mail**

Implemente o `send` do adaptador correspondente em
`src/server/services/notifications.ts` e ligue a flag no `.env`
(`NOTIFY_WHATSAPP_ENABLED="true"`). Nada mais no sistema muda: quem dispara
os eventos só conhece `notifyOrderStatus`.

**Adicionar um gateway de pagamento**

Implemente a interface `PaymentProvider` (`src/server/payments/types.ts`) e
registre no mapa de `src/server/payments/index.ts`. As telas e as rotas de
pedido não mudam.

**Criar uma promoção**

`/admin/cupons`. O cupom passa a valer no checkout imediatamente, com
validação de período, valor mínimo, teto de desconto, limite total e limite
por cliente — tudo conferido no servidor.

**Mudar taxa de entrega ou pedido mínimo**

`/admin/configuracoes`. Nunca no código.

---

## Licença

Uso privado da DS Espetos.
