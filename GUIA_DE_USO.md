# TributoFlow — Guia de Uso

> Versao 0.1.0 (MVP) | Atualizado em 2026-03-25

---

## 1. Primeiros Passos

### 1.1 Criar Conta do Escritorio

1. Acesse a pagina inicial e clique em **"Criar conta gratuita"**.
2. Preencha: nome completo, email, senha, nome do escritorio e CNPJ (opcional).
3. Clique em **"Criar conta — 7 dias gratis"**.
4. Voce sera redirecionado ao **Dashboard Admin** do seu escritorio.

### 1.2 Entrar

1. Acesse `/login`.
2. Informe email e senha cadastrados.
3. O sistema redireciona automaticamente para o painel correto (Admin ou Portal do Cliente).

---

## 2. Painel Admin (Escritorio Contabil)

### 2.1 Dashboard (`/admin/dashboard`)

Visao geral do escritorio com indicadores:

- **Empresas** — total de clientes cadastrados.
- **Total de Itens** — quantidade de produtos/servicos importados.
- **Sem NCM** — itens que precisam de NCM valido.
- **Classificados** — itens com classificacao fiscal concluida.
- **Grafico de Impacto Tributario** — comparacao visual antes/depois da reforma.
- **Empresas Recentes** — lista rapida dos ultimos clientes adicionados.

### 2.2 Clientes (`/admin/clientes`)

Gerencie as empresas atendidas pelo escritorio.

**Como cadastrar uma empresa:**
1. Clique em **"Nova Empresa"**.
2. Preencha: razao social, nome fantasia, CNPJ, regime tributario, CNAE principal, nome e email do contato.
3. Clique em **"Cadastrar"**.

**Filtros:** busque por nome ou CNPJ na barra de pesquisa.

### 2.3 Itens (`/admin/itens`)

Cadastre e gerencie produtos/servicos das empresas clientes.

**Importar via planilha XLSX:**
1. Selecione a empresa no filtro.
2. Clique em **"Importar XLSX"** e selecione o arquivo.
3. A planilha deve conter as colunas: `descricao`, `codigo`, `ncm`, `tipo` (mercadoria/servico), `unidade`, `custo`.
4. Os itens serao importados automaticamente com status "pendente".

**Filtros disponiveis:** por empresa e por status (pendente, em revisao, classificado).

### 2.4 Diagnostico NCM/NBS (`/admin/ncm-diagnostico`)

Identifique problemas de classificacao NCM nos itens importados.

**O que o diagnostico detecta:**
- **Sem NCM** — item sem codigo NCM preenchido.
- **NCM Invalido** — codigo nao encontrado na tabela oficial.
- **NCM Vencido** — codigo fora de vigencia.

**Como usar:**
1. Filtre por empresa (opcional).
2. Os KPIs mostram: total de itens, sem NCM, NCM invalido, NCM valido e taxa de cobertura.
3. Clique em um item na tabela de pendencias para abrir o **Painel de Sugestao de NCM**.
4. No painel, busque por descricao ou codigo para encontrar o NCM correto.
5. Clique **"Usar"** para aplicar a sugestao.
6. Exporte o relatorio em XLSX clicando **"Exportar XLSX"**.

**Painel de Sugestao de NCM:**
- **Busca por descricao** — digite palavras-chave do produto (ex: "arroz branco polido") e o sistema busca na tabela oficial.
- **Busca por codigo** — digite o inicio do NCM (ex: "1006") para autocompletar.
- **Validacao** — clique "Validar" ao lado do NCM atual para checar se existe e esta vigente.
- Resultados mostram badge **"Alta relevancia"** quando o match e forte.

### 2.5 Classificacao Fiscal (`/admin/classificacao`)

Wizard em 4 passos para classificar itens com CST e cClassTrib da LC 214/2025.

**Passo a passo:**
1. **Selecione o item** na lista lateral (filtre por empresa se necessario).
2. **Passo 1 — NCM/NBS:** confirme ou corrija o NCM (mercadorias) ou NBS (servicos).
3. **Passo 2 — CST IBS/CBS:** selecione a situacao tributaria:
   - 01 = Tributado integralmente
   - 02 = Tributado com reducao
   - 03 = Isento
   - 04 = Imune
   - 05 = Nao tributado
4. **Passo 3 — cClassTrib:** escolha o codigo de classificacao tributaria. O sistema mostra os percentuais de reducao de IBS e CBS de cada opcao.
5. **Passo 4 — Justificativa:** escreva o fundamento legal da classificacao (minimo 10 caracteres). Cite artigos da LC 214/2025.
6. Clique **"Confirmar Classificacao"**. O item muda para status "classificado".

> As opcoes de CST e cClassTrib sao buscadas do banco de dados. Caso a tabela esteja vazia, valores padrao sao usados como fallback.

### 2.6 Simulador de Precos (`/admin/precos`)

Simule o impacto da reforma tributaria nos precos de venda.

**Como usar:**
1. Filtre por empresa.
2. Ajuste os parametros:
   - **Aliquota legada** — percentual do regime tributario atual (padrao: 18%).
   - **Margem alvo** — margem de lucro desejada (padrao: 20%).
3. A tabela mostra para cada item classificado:
   - Preco antes da reforma.
   - Preco apos a reforma (com IBS/CBS).
   - Variacao percentual.
   - Carga tributaria efetiva.
4. Clique **"Salvar Cenario"** para persistir a simulacao no banco.
5. Exporte para XLSX clicando **"Exportar XLSX"**.

> Apenas itens com status "classificado" e com custo base informado aparecem na simulacao.

### 2.7 Relatorios e Auditoria (`/admin/relatorios`)

Exporte laudos de classificacao e acompanhe a trilha de auditoria.

**Mapa de Classificacoes:**
- Tabela com todos os itens classificados: NCM, CST, cClassTrib, justificativa, responsavel, data e status.
- Filtre por empresa.
- Exporte em **PDF** (laudo formal com logotipo e metodologia) ou **XLSX** (planilha para analise).

**Trilha de Auditoria:**
- Lista das ultimas 20 acoes no sistema: criacao, atualizacao, exclusao e aprovacao.
- Mostra: tipo de entidade, acao, usuario responsavel, data/hora e diff de alteracoes.

### 2.8 Usuarios (`/admin/usuarios`)

Visualize os usuarios do escritorio e seus perfis de acesso.

- **office_owner** — socio/diretor do escritorio (acesso total).
- **office_staff** — analista fiscal/contabil.
- **company_user** — usuario da empresa cliente (acesso ao portal).

> Convite por email sera implementado em versao futura.

### 2.9 Configuracoes (`/admin/configuracoes`)

Tres abas de configuracao:

**Aba Escritorio:**
- Edite nome e CNPJ do escritorio.

**Aba Parametros Fiscais:**
- Aliquota IBS Estadual (%) — padrao: 15.
- Aliquota IBS Municipal (%) — padrao: 5.
- Aliquota CBS (%) — padrao: 8.77.
- Markup padrao (%) — padrao: 30.
- Aliquota legada (%) — padrao: 18.

**Aba Integracoes:**
- Configure conexoes com sistemas externos:
  - **Conformidade Facil** — validacao de NCM em tempo real.
  - **SEFAZ NF-e** — consulta de notas fiscais.
  - **ERP Generico** — integracao com ERP do cliente.
- Para cada integracao: informe URL da API, chave de API, ative/desative, e teste a conexao.

---

## 3. Portal do Cliente (Empresa)

### 3.1 Dashboard (`/empresa/dashboard`)

Resumo visual para a empresa cliente:
- Total de itens cadastrados.
- Itens classificados, em revisao e pendentes.
- Barra de progresso de classificacao.

### 3.2 Meus Itens (`/empresa/itens`)

Lista read-only dos itens da empresa:
- Descricao, NCM, cClassTrib aplicado e status.
- Busca por descricao ou NCM.

### 3.3 Simulacoes (`/empresa/simulacoes`)

Visualize simulacoes de precos criadas pelo escritorio:
- Tabela com: item, preco antes, preco depois, variacao, carga tributaria e cenario.
- Exporte para XLSX.

---

## 4. Fluxo Recomendado de Trabalho

```
1. Cadastrar escritorio
2. Cadastrar empresas clientes
3. Importar itens via XLSX
4. Rodar diagnostico NCM (corrigir pendencias)
5. Classificar itens (wizard CST + cClassTrib)
6. Simular precos (antes/depois da reforma)
7. Exportar laudos em PDF/XLSX
8. Compartilhar resultados via Portal do Cliente
```

---

## 5. Formatos de Arquivo

### Planilha de Importacao de Itens (XLSX)

| Coluna | Obrigatoria | Descricao |
|--------|-------------|-----------|
| descricao | Sim | Descricao do produto/servico |
| codigo | Nao | Codigo interno (SKU) |
| ncm | Nao | Codigo NCM (8 digitos) |
| tipo | Nao | "mercadoria" ou "servico" |
| unidade | Nao | UN, KG, LT, etc. |
| custo | Nao | Custo medio unitario |

### Exportacoes Disponiveis

| Modulo | Formato | Conteudo |
|--------|---------|----------|
| Diagnostico NCM | XLSX | Lista de pendencias com tipo de problema |
| Classificacao | PDF | Laudo formal com metodologia e justificativas |
| Classificacao | XLSX | Mapa de classificacoes em planilha |
| Simulacao de Precos | XLSX | Tabela de precos antes/depois |

---

## 6. Seguranca e Isolamento

- Cada escritorio opera como tenant isolado — nenhum dado e compartilhado entre escritorios.
- Empresas clientes so veem seus proprios itens e simulacoes.
- Todas as operacoes ficam registradas na trilha de auditoria.
- Autenticacao via Supabase Auth com Row Level Security (RLS) em todas as tabelas.

---

## 7. Suporte

- **Trial:** 7 dias gratis ao criar conta.
- **Planos:** por faixa de empresas clientes (ate 30, ate 100, etc.).
- **Contato:** suporte@tributoflow.app (placeholder).
