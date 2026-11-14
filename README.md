# Meu Schedule — PWA com IndexedDB (v2.1 — LIMPO)

PWA de escalas de trabalho com histórico de dias, semanas e meses. **Esta versão não contém nenhuma pessoa, foto ou escala pré-cadastrada.** Em uma instalação nova, começa com 0 pessoas, 0 horários e 0 fotos.

## Funciona diretamente (sem chave de IA)

- **Armazenamento local em IndexedDB:** grava os **horários estruturados e as imagens compactadas** que você enviar. Cada foto fica vinculada aos horários extraídos ou inseridos manualmente.
- **Várias fotos de vários dias:** botão **Adicionar fotos** permite escolher várias imagens de uma vez e não apaga registros antigos. O dia fica vinculado a cada registro. Você pode fornecer data antes do upload ou alterar a data depois no painel de fotos.
- **Pesquisa pelo nome, sobrenome ou ID:** mostra o histórico agrupado por nome/data e com horários. Filtre por **dia, semana, mês ou todo o histórico**.
- **Inserção manual:** caso a leitura de fotos ainda não esteja configurada, use **+ Adicionar horário**. A foto fica guardada aguardando leitura futura.
- **Atualização segura:** se você atualizar o PWA usando o mesmo endereço, o IndexedDB existente permanece. Dados da versão mais antiga guardados em `localStorage.ext` podem ser migrados uma vez; por isso, para zerar uma instalação já usada, utilize o botão **Zerar histórico local**. **O aplicativo não apaga os dados automaticamente em atualizações.**
- **Zerar o histórico local:** em **Backup e armazenamento**, o botão **Zerar histórico local (fotos e horários)** apaga os registros do IndexedDB **somente após duas confirmações**. Faça backup antes.
- **Backup completo:** exporta um arquivo JSON com imagens e dados; pode ser restaurado em outro dispositivo. O arquivo pode ser grande se houver muitas fotos.
- **Offline:** escalas já salvas, imagens e pesquisa funcionam sem internet depois do primeiro carregamento. Ler **novas fotos por IA exige internet**.

## Reconhecimento automático da foto (opcional)

O HTML original chamava uma integração `window.claude.use('sample')` que **não existe em sites PWA normais**. A v2 oferece uma implementação opcional do endpoint `functions/api/extract.js` para **Cloudflare Pages Functions**, que extrai nome, data, turno, setor, pausa e observações pela OpenAI API.

Para habilitar a extração em um site publicado:

1. Crie um projeto **Cloudflare Pages** com deploy por **Git** ou Wrangler, com `index.html`, `app.js`, `functions/`, `icons/` e demais arquivos diretamente na raiz do repositório. No deploy, as Pages Functions na pasta `functions/` devem ser incluídas.
2. Configure secrets nas configurações do projeto: `OPENAI_API_KEY` = sua chave privada da OpenAI API; `SCHEDULE_UPLOAD_TOKEN` = token de acesso criado por você. Mantenha ambos exclusivamente no servidor. Opcional: `OPENAI_MODEL` (padrão `gpt-4.1-mini`). **Há custos de uso da API**.
3. No PWA instalado, abra **Leitura automática de fotos (opcional)** e coloque somente o **token de acesso**, nunca a chave da OpenAI. O token é guardado apenas em `sessionStorage` para a sessão atual.
4. Envie várias fotos. O aplicativo tentará extrair as linhas de cada foto automaticamente. Se a IA não estiver disponível, mantém as imagens salvas; toque em **Ler com IA** mais tarde, após configurar o servidor.
5. Confira a leitura com a foto original. Datas ou horários ilegíveis podem ficar vazios; o app não atribui automaticamente o dia atual.

**Importante:** apenas enviar o ZIP por upload estático a uma hospedagem não garante que o endpoint seja instalado. É necessário configurar e implantar Pages Functions. A chave da API não deve ser colocada em `index.html` ou `app.js`. Um token compartilhado simples é uma barreira básica, mas para uso organizacional recomende autenticação forte, limites de requisição e Cloudflare Access.

## Instalar

Publique os arquivos em HTTPS (incluindo `icons/`), acesse pelo celular e use **Instalar app** no Android ou **Adicionar à Tela de Início** no Safari/iPhone. Abertura via `file://` não instala service worker.

Para teste local:

```bash
python -m http.server 8000
```

Abra http://localhost:8000. O servidor de teste estático não fornece a integração automática de IA, apenas a aplicação offline e seu IndexedDB.

## Cuidados com histórico e privacidade

- IndexedDB é **local por origem de site, navegador e perfil**. Não há sincronização automática entre aparelhos. Se o usuário limpar os dados do site, desinstalar com exclusão dos dados ou o navegador remover o armazenamento, o histórico pode desaparecer. Faça **backup regularmente**.
- O espaço depende do dispositivo/navegador, mesmo com fotos compactadas. O botão *Pedir proteção do armazenamento* pode reduzir o risco de remoção, mas não garante permanência.
- Os dados da escala contêm nomes e horários de pessoas. Não publique dados internos sem autorização. Ao usar a extração via IA, a foto é enviada ao serviço configurado **somente quando a leitura é solicitada**.
- Se a data da foto não estiver visível, informe manualmente para que a escala seja agrupada no dia correto.
- Não há base inicial embutida. Se aparecerem pessoas após atualizar, são dados que já estavam salvos localmente neste mesmo site/navegador.

## Estrutura

- `index.html`: interface de consulta, importação e backup
- `app.js`: lógica IndexedDB/galeria/histórico/extração, sem base pré-cadastrada
- `service-worker.js`: cache offline dos arquivos do app
- `manifest.webmanifest` e `icons/`: recursos de instalação
- `functions/api/extract.js`: Cloudflare Pages Function opcional, protegida por token

## ZIP preparado para o GitHub (raiz direta)

Ao extrair o ZIP, `index.html`, `app.js`, `manifest.webmanifest`, `service-worker.js` e `README.md` aparecem diretamente na pasta de destino. Apenas as subpastas obrigatórias `icons/` e `functions/` continuam como pastas. **Não existe pasta externa `meu-schedule-pwa/` dentro do ZIP.**

## Como deixar realmente zerado

- **Primeira instalação em um domínio novo:** inicia vazio (0 pessoas, 0 horários, 0 fotos).
- **Atualização no mesmo site:** remove a lista fixa dos 102 funcionários, mas mantém históricos já salvos no IndexedDB por segurança.
- **Se desejar apagar o que já tinha enviado:** abra **Backup e armazenamento → Zerar histórico local (fotos e horários)**, confira o alerta e digite `ZERAR`. Esta exclusão é irreversível sem backup.
- O botão não apaga registros de outros domínios, navegadores ou celulares.
