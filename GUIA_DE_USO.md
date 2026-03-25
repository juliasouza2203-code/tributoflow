# TributoFlow — Guia de Uso

> Versao 0.1.0 (MVP) | Atualizado em 2026-03-25

---

## Indice

1. [Primeiro Acesso — Cadastro do Escritorio](#1-primeiro-acesso--cadastro-do-escritorio)
2. [Login](#2-login)
3. [Dashboard Fiscal](#3-dashboard-fiscal)
4. [Cadastro de Empresas Clientes](#4-cadastro-de-empresas-clientes)
5. [Cadastro e Importacao de Itens](#5-cadastro-e-importacao-de-itens)
6. [Diagnostico NCM](#6-diagnostico-ncm)
7. [Classificacao Fiscal (CST + cClassTrib)](#7-classificacao-fiscal-cst--cclasstrib)
8. [Simulador de Precos IBS/CBS](#8-simulador-de-precos-ibscbs)
9. [Relatorios e Auditoria](#9-relatorios-e-auditoria)
10. [Usuarios e Permissoes](#10-usuarios-e-permissoes)
11. [Configuracoes do Escritorio](#11-configuracoes-do-escritorio)
12. [Portal do Cliente (Empresa)](#12-portal-do-cliente-empresa)
13. [Status das Funcionalidades](#13-status-das-funcionalidades)

---

## 1. Primeiro Acesso — Cadastro do Escritorio

**Rota:** `/cadastro/escritorio`

O TributoFlow opera em modelo multi-tenant: cada escritorio contabil e um tenant independente.

**Passo a passo:**

1. Acesse a landing page e clique em **"Comecar gratis"** ou **"Criar conta gratuita"**.
2. Preencha:
   - **Nome completo** — nome do responsavel.
   - **Email** — sera usado para login.
   - **Senha** — minimo 8 caracteres.
   - **Nome do escritorio** — nome fantasia do escritorio contabil.
   - **CNPJ do escritorio** (opcional) — CNPJ do proprio escritorio.
3. Clique em **"Criar conta — 7 dias gratis"**.
4. O sistema cria automaticamente:
   - Sua conta de usuario.
   - O escritorio (tenant).
   - Seu perfil com role `office_owner`.
5. Voce sera redirecionado para o **Dashboard Fiscal**.

> **Nota:** O trial de 7 dias e ativado automaticamente no cadastro.

---

## 2. Login

**Rota:** `/login`

1. Informe **email** e **senha**.
2. Clique em **"Entrar"**.
3. Voce sera redirecionado para o painel correto:
   - `office_owner` ou `office_staff` → Dashboard Admin (`/admin/dashboard`).
   - `company_user` → Portal do Cliente (`/empresa/dashboard`).

---

## 3. Dashboard Fiscal

**Rota:** `/admin/dashboard`

Visao geral do escritorio com KPIs em tempo real:

| KPI | O que mostra |
|-----|-------------|
| **Total de Empresas** | Quantidade de empresas clientes cadastradas |
| **Itens sem NCM** | Itens que ainda nao tem NCM informado |
| **Itens Classificados** | Itens com classificacao fiscal concluida |
| **Itens Pendentes** | Itens aguardando classificacao |

**Secoes do dashboard:**

- **Progresso de Classificacao** — barra de progresso por empresa mostrando % de itens classificados.
- **Impacto Tributario** — grafico de barras comparando carga tributaria antes vs. depois da reforma (IBS/CBS).
- **Problemas Recentes** — tabela com itens que tem pendencias (NCM ausente, classificacao pendente, etc.).

---

## 4. Cadastro de Empresas Clientes

**Rota:** `/admin/clientes`

Aqui voce gerencia as empresas atendidas pelo escritorio.

**Para cadastrar uma empresa:**

1. Clique em **"Nova Empresa"**.
2. Preencha os campos obrigatorios:
   - **Razao Social** — nome juridico da empresa.
   - **CNPJ** — formato XX.XXX.XXX/XXXX-XX.
   - **Regime Tributario** — Simples Nacional, Lucro Presumido, Lucro Real ou MEI.
   - **CNAE Principal** — codigo CNAE da atividade principal.
3. Campos opcionais:
   - **Nome Fantasia** — nome comercial.
4. Clique em **"Cadastrar"**.

**Funcoes disponiveis:**

- **Busca** — filtre empresas por nome ou CNPJ.
- **Listagem** — veja todas as empresas com razao social, CNPJ, regime e data de cadastro.

---

## 5. Cadastro e Importacao de Itens

**Rota:** `/admin/itens`

Gerencie os itens (produtos e servicos) de cada empresa.

### 5.1 Importacao via Planilha XLSX

Esta e a forma mais rapida de cadastrar itens em massa.

1. Selecione a **empresa** no filtro superior.
2. Clique em **"Importar XLSX"**.
3. Selecione o arquivo `.xlsx`.

**Formato esperado da planilha:**

| Coluna | Campo | Obrigatorio |
|--------|-------|-------------|
| A | descricao (ou description) | Sim |
| B | ncm | Nao |
| C | tipo (goods/services) | Nao (padrao: goods) |
| D | unidade (un, kg, etc.) | Nao |
| E | custo (valor numerico) | Nao |
| F | codigo (SKU interno) | Nao |

> **Dica:** A primeira linha da planilha deve conter os cabecalhos. O sistema reconhece nomes em portugues e ingles.

4. Apos importar, os itens aparecem na lista com status **"Pendente"**.

### 5.2 Filtros

- **Por empresa** — selecione a empresa no dropdown.
- **Por status** — Todos, Pendente, Em revisao, Classificado.

### 5.3 Status dos Itens

| Status | Significado |
|--------|-------------|
| `pending` | Importado, aguardando classificacao |
| `in_review` | Em processo de revisao/classificacao |
| `classified` | Classificacao fiscal concluida |

---

## 6. Diagnostico NCM

**Rota:** `/admin/ncm-diagnostico`

Identifica problemas nos codigos NCM dos itens cadastrados.

**Como usar:**

1. Selecione a **empresa** no filtro (ou deixe "Todas" para ver o escritorio inteiro).
2. A tabela mostra automaticamente os itens com problemas.
3. Cada item mostra:
   - Descricao do item.
   - NCM atual (ou "Nao informado").
   - Tipo do problema detectado.
   - Empresa a que pertence.

**Tipos de problemas detectados:**

| Problema | Descricao |
|----------|-----------|
| NCM Ausente | Item nao possui NCM informado |

**Exportacao:**

- Clique em **"Exportar XLSX"** para baixar a lista de problemas em planilha.
- Util para enviar ao cliente solicitando os NCMs corretos.

---

## 7. Classificacao Fiscal (CST + cClassTrib)

**Rota:** `/admin/classificacao`

O modulo principal do TributoFlow. Aqui voce define a classificacao tributaria IBS/CBS de cada item.

### 7.1 Fluxo do Wizard (4 passos)

**Passo 1 — Selecao do Item:**
1. Filtre por empresa e/ou status.
2. Clique em **"Classificar"** no item desejado.

**Passo 2 — Confirmacao NCM/NBS:**
- Confirme ou corrija o NCM do item (para mercadorias).
- Informe o NBS (para servicos).
- Clique em **"Proximo"**.

**Passo 3 — Selecao do CST IBS/CBS:**
- Escolha o CST aplicavel. Opcoes disponiveis:

| Codigo | Descricao |
|--------|-----------|
| 00 | Tributacao normal |
| 10 | Tributacao com reducao de base de calculo |
| 20 | Isencao |
| 30 | Imunidade |
| 40 | Nao incidencia |
| 50 | Regime especifico/monofasico |
| 90 | Outros |

**Passo 4 — Selecao do cClassTrib + Justificativa:**
- Escolha o codigo de Classificacao Tributaria. Opcoes incluem:

| Codigo | Descricao | Reducao IBS | Reducao CBS |
|--------|-----------|-------------|-------------|
| 01 | Tributacao integral | 0% | 0% |
| 02 | Aliquota reduzida 60% | 60% | 60% |
| 03 | Aliquota reduzida 30% | 30% | 30% |
| 04 | Isento | 100% | 100% |
| 05 | Imune | 100% | 100% |
| 06 | Regime especifico | 0% | 0% |
| 07 | Monofasico | 0% | 0% |
| 08 | Cesta basica nacional | 100% | 100% |
| 09 | Reducao 100% saude/educacao | 100% | 100% |
| 10 | Zona Franca de Manaus | 100% | 0% |

- Escreva a **justificativa** da classificacao (campo obrigatorio).
  - Exemplo: "Item enquadrado no Anexo I da LC 214/2025, Art. 128 — alimentos da cesta basica nacional."
- Clique em **"Salvar Classificacao"**.

### 7.2 Trilha de Auditoria

Toda classificacao gera automaticamente um registro de auditoria contendo:
- Quem fez (usuario).
- Quando (data/hora).
- O que mudou (NCM, CST, cClassTrib, justificativa).

---

## 8. Simulador de Precos IBS/CBS

**Rota:** `/admin/precos`

Simula o impacto da reforma tributaria nos precos dos itens ja classificados.

### 8.1 Como simular

1. Selecione a **empresa**.
2. A tabela mostra apenas itens com status **"Classificado"**.
3. Para cada item, voce ve:
   - Descricao e NCM.
   - Custo base.
   - Reducao aplicada (do cClassTrib).
4. Defina o **nome do cenario** (ex: "Tabela 2026 Semestre 1").
5. Defina a **margem alvo** (%) para cada item.
6. Clique em **"Simular"**.

### 8.2 Resultados da simulacao

| Campo | Descricao |
|-------|-----------|
| Preco Antes | Preco com a carga tributaria atual (estimada) |
| Preco Depois | Preco com IBS/CBS aplicados |
| Carga Antes | Percentual de impostos sobre o preco (regime atual) |
| Carga Depois | Percentual de impostos sobre o preco (IBS/CBS) |
| Variacao | Diferenca percentual entre preco antes e depois |

### 8.3 Formula de calculo

O simulador usa calculo "por dentro" (imposto embutido no preco):

```
Aliquota efetiva = (IBS_estadual + IBS_municipal + CBS) * (1 - reducao)
Preco = Custo / (1 - margem - aliquota_efetiva)
```

**Aliquotas padrao (referencia LC 214/2025):**

| Tributo | Aliquota |
|---------|----------|
| IBS Estadual | 17,7% |
| IBS Municipal | 2,3% |
| CBS | 8,8% |
| **Total** | **28,8%** |

> **Nota:** Itens com cClassTrib de reducao (ex: 60%, 30%, 100%) terao a aliquota efetiva reduzida proporcionalmente.

### 8.4 Salvamento

- Cada simulacao e salva como um **cenario de preco** vinculado ao item/empresa.
- Cenarios ficam disponiveis para consulta no Portal do Cliente.

---

## 9. Relatorios e Auditoria

**Rota:** `/admin/relatorios`

### 9.1 Aba "Mapa de Classificacoes"

Tabela consolidada de todas as classificacoes do escritorio:

| Coluna | Descricao |
|--------|-----------|
| Item | Descricao do item |
| Empresa | Empresa dona do item |
| NCM | Codigo NCM utilizado |
| CST | Codigo CST IBS/CBS |
| cClassTrib | Codigo de classificacao tributaria |
| Justificativa | Texto da justificativa |
| Responsavel | Quem fez a classificacao |
| Data | Quando foi classificado |
| Status | Draft, Aprovado ou Arquivado |

**Exportacao:** Clique em **"Exportar XLSX"** para baixar o mapa completo.

### 9.2 Aba "Trilha de Auditoria"

Historico de todas as acoes realizadas no sistema:

| Campo | Descricao |
|-------|-----------|
| Entidade | Tipo (item, classificacao, cenario de preco) |
| Acao | create, update, delete, approve |
| Usuario | Quem realizou |
| Data | Quando |
| Alteracoes | Diff do antes/depois em JSON |

---

## 10. Usuarios e Permissoes

**Rota:** `/admin/usuarios`

Gerencie a equipe do escritorio.

**Informacoes exibidas:**

- Nome do usuario.
- Email.
- Role atribuido (`office_owner`, `office_staff`, `company_user`).
- Data de criacao.

**Roles disponiveis:**

| Role | Permissoes |
|------|-----------|
| `office_owner` | Acesso total ao escritorio. Gerencia usuarios, configuracoes e todas as funcoes. |
| `office_staff` | Analista fiscal/contabil. Acesso a clientes, itens, classificacao, simulacao e relatorios. |
| `company_user` | Usuario da empresa cliente. Acesso apenas ao Portal do Cliente (leitura). |

> **Nota:** A funcao de convite de novos usuarios esta em desenvolvimento.

---

## 11. Configuracoes do Escritorio

**Rota:** `/admin/configuracoes`

### 11.1 Aba "Escritorio"

Edite os dados basicos:
- **Nome do escritorio** — nome fantasia.
- **Slug** — identificador na URL (gerado automaticamente).

Clique em **"Salvar Alteracoes"** para persistir.

### 11.2 Aba "Fiscal"

Parametros de referencia para simulacoes:
- Aliquota IBS Estadual padrao (%).
- Aliquota IBS Municipal padrao (%).
- Aliquota CBS padrao (%).
- Markup padrao (%).

> **Nota (MVP):** Esses parametros sao exibidos na interface mas ainda nao sao persistidos no banco. O simulador usa as aliquotas padrao hard-coded (17,7% / 2,3% / 8,8%).

### 11.3 Aba "Integracoes"

Conexoes com sistemas externos (em desenvolvimento):
- API NF-e / Sefaz.
- ERP generico.
- Conformidade Facil.

---

## 12. Portal do Cliente (Empresa)

Acesso para usuarios com role `company_user`.

### 12.1 Dashboard (`/empresa/dashboard`)

Visao geral fiscal da empresa:
- Total de itens.
- Itens classificados.
- Itens em revisao.
- Barra de progresso geral.

### 12.2 Meus Itens (`/empresa/itens`)

Lista de itens da empresa com:
- Descricao, NCM, status.
- Codigo cClassTrib aplicado (quando classificado).

> O cliente pode acompanhar o andamento das classificacoes feitas pelo escritorio.

### 12.3 Simulacoes (`/empresa/simulacoes`)

Visualize os cenarios de preco criados pelo escritorio:
- Preco antes/depois da reforma.
- Variacao percentual.
- Carga tributaria nova.

**Exportacao:** Clique em **"Exportar XLSX"** para baixar os cenarios.

---

## 13. Status das Funcionalidades

| Funcionalidade | Status | Observacao |
|---------------|--------|-----------|
| Cadastro de escritorio | Funcional | Trial 7 dias |
| Login/autenticacao | Funcional | Email + senha |
| Dashboard fiscal | Funcional | KPIs em tempo real |
| Cadastro de empresas | Funcional | CRUD completo |
| Importacao de itens (XLSX) | Funcional | Mapeamento automatico de colunas |
| Diagnostico NCM | Parcial | Detecta NCM ausente; validacao contra tabela oficial pendente |
| Classificacao fiscal | Funcional | Wizard 4 passos com auditoria |
| Simulador de precos | Funcional | Calculo por dentro IBS/CBS |
| Relatorios + exportacao XLSX | Funcional | Mapa de classificacoes + auditoria |
| Usuarios e permissoes | Parcial | Lista usuarios; convite pendente |
| Configuracoes fiscais | Parcial | Dados do escritorio ok; parametros fiscais nao persistem |
| Integracoes (NF-e, ERP) | Placeholder | Em desenvolvimento |
| Relatorio PDF (laudo) | Pendente | jsPDF instalado mas nao integrado |
| Sugestao de NCM com IA | Pendente | Modulo RAG em estudo |
| Portal do cliente | Funcional | Dashboard, itens, simulacoes |

---

## Dicas Rapidas

- **Fluxo recomendado:** Cadastrar empresa → Importar itens → Rodar diagnostico → Classificar → Simular precos.
- **Exportacoes** estao disponiveis em XLSX em quase todas as telas (diagnostico, relatorios, simulacoes).
- **Auditoria** e automatica — toda classificacao gera registro de quem fez e quando.
- **Multi-tenant** — cada escritorio so ve seus proprios dados. Isolamento total.
