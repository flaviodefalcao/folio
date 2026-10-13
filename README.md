# Folio

Leitor EPUB open source para Android, com biblioteca local e conversa sobre o livro usando modelos OpenAI. Implementação própria inspirada nos recursos de leitura do Kindle; não incorpora código, marca, DRM ou serviços da Amazon. Licença MIT para o código deste projeto. Dependências mantêm suas respectivas licenças.

## Instalar ou atualizar no Android

Baixe o **[APK da versão 0.7.0](https://github.com/flaviodefalcao/folio/releases/download/v0.7.0/Folio-Android-v0.7.0.apk)** e abra no celular Android. Quando o Android pedir, permita a instalação pela origem usada para abrir esse arquivo. O APK é assinado com uma chave local própria do projeto, para instalação direta, e não foi publicado na Play Store. Requer **Android 7.0 (API 24) ou superior**, com Android System WebView atualizado.

Instale a versão 0.7.0 sobre a anterior, sem desinstalar: o pacote e a assinatura são os mesmos para preservar seus dados. Esta atualização inclui player com capa e controles grandes, páginas que acompanham a narração, leitura em tela cheia e biblioteca minimalista com capas ajustáveis.

Todos os livros, posições, notas e conversas ficam no aparelho. A leitura não exige internet. Anna’s Archive, dicionário e OpenAI precisam de conexão. O exemplo incluído permite testar o leitor antes de importar seus livros.

## Compilar o APK

```sh
npm ci
bash scripts/bootstrap-android.sh
npm run android:build
```

O ambiente Android/JDK fica isolado em `.toolchain`, sem alterar instalações globais. O script gera uma chave de assinatura própria apenas na primeira execução e reutiliza-a nas atualizações. Preserve `.toolchain/folio-release.jks`, `.toolchain/keystore-password` e `.toolchain/signing.properties` em local privado para produzir atualizações com a mesma assinatura. Esses arquivos são excluídos do Git e do ZIP de código-fonte. Quem compilar o código pela primeira vez receberá outra chave local.

O código também tem uma versão Electron (`npm run desktop`) e uma prévia web (`npm run dev`). A prévia web permite biblioteca e leitura; as funcionalidades nativas dependem do Android ou Electron.

## Ler e organizar

O botão **Compactar biblioteca** no topo reduz o cabeçalho e o cartão de continuação. O cartão **Continue de onde parou** também tem uma seta própria para recolher ou expandir, mantendo o título, o progresso e o botão de leitura. As duas escolhas ficam salvas no aparelho e podem ser revertidas.

- Importe EPUBs sem DRM com “Adicionar EPUB”, seleção múltipla ou arraste arquivos para a biblioteca.
- O exemplo incluído, **A arte de ler devagar**, é um texto original de quatro capítulos; não faz chamadas de IA.
- Biblioteca, favoritos, coleções, ordenação por autor/título/recentes e livros concluídos.
- Leitura paginada ou rolável, sumário, progresso salvo, marcadores e retorno à última posição.
- Fonte, tamanho, espaçamento, largura, temas claro/sépia/escuro e tela cheia.
- Busca por palavra ou expressão, normalizada para acentos. O resultado leva ao capítulo; não promete posicionar na ocorrência exata.
- Selecione um trecho para destacar, acrescentar nota, abrir Wiktionary ou perguntar à IA. Notas editáveis e exportáveis em Markdown.
- Leitura em voz alta usa as vozes instaladas no sistema; não substitui Audible.

## Busca nativa e EPUB com um toque

Em **Descobrir livros**, digite o título ou autor. O catálogo principal agora usa metadados reais da **API Gutendex/Project Gutenberg**, com EPUBs disponíveis para download direto. Toque **Adicionar à biblioteca** para baixar, validar e importar no próprio app; não há página externa nesse fluxo.

Um índice local de **32 clássicos em português** vem no APK e permite pesquisar imediatamente, até offline. Ele inclui Dom Casmurro, Os Lusíadas e Memórias Póstumas de Braz Cubas. Esse índice é uma seleção inicial real, **não** todos os 655 registros portugueses encontrados na API. **Ampliar na API** consulta o catálogo online; consultas já feitas ficam salvas por sete dias. A disponibilidade e latência do servidor público variam. Para outros idiomas, altere o filtro. O catálogo oferece principalmente domínio público; livros contemporâneos podem não estar disponíveis.

**Anna’s Archive** oferece integração premium no APK Android. Em **Preferências**, cole a chave secreta da sua conta em **Chave premium do Anna’s Archive** e salve. A chave é cifrada com AndroidKeyStore/AES-GCM e fica separada da chave OpenAI. Deixar o campo em branco mantém a chave; a opção de remoção apaga a chave premium deste aparelho. Ao configurar a chave, o catálogo Anna passa a ser a fonte inicial. Busque por título/autor, escolha um EPUB e toque **Baixar premium**: o Android pede o link à API oficial e baixa, valida e importa o arquivo sem abrir a página de download. A chamada à API de download usa a franquia da conta, mesmo se uma transferência posterior falhar. A última franquia informada pela API aparece no catálogo.

A API oficial fornece downloads pelo MD5 do arquivo, não uma busca JSON pública por título. A busca do Android usa a página real em um navegador isolado dentro do app, independente de uma conexão HTTP de login premium. Quando os resultados carregam, eles retornam automaticamente à lista nativa. Cada livro tem **Ver links**; a janela mostra os servidores e os endereços disponíveis. Escolha **Baixar para biblioteca** para obter o EPUB, validar, importar e abrir a biblioteca. Links que exigem etapas no site têm **Continuar dentro do app**. O download premium usa o servidor escolhido pela API, sem expor a chave no endereço apresentado. As sessões ficam somente na memória nativa. Os domínios reconhecidos para enviar a chave são `annas-archive.gl`, `annas-archive.gd` e `annas-archive.pk`, declarados no código oficial inspecionado; novos domínios precisam ser verificados antes de entrar nessa lista.

Sem chave premium, Anna’s Archive continua disponível como catálogo adicional. A busca nativa interpreta os resultados quando o site permite a consulta. Se houver uma verificação normal antirrobô, ela abre em um navegador **dentro do app**, separado da biblioteca e sem acesso à chave OpenAI. Depois da verificação, use **Usar resultados no Folio**. Páginas de detalhe e downloads podem ter etapas intermediárias; não há bypass de desafios. Não houve teste com uma chave premium real: o usuário fará a configuração no aparelho. Foram verificados o protocolo nativo com respostas controladas, a importação de um EPUB original e os demais testes descritos em `research/PREMIUM.md`.

**Importar link** também aceita um endereço HTTPS público direto de EPUB. Downloads no Android têm limite de 40 MB. Metadados não garantem que todo arquivo permaneça disponível; falhas aparecem na interface. O fluxo direto foi testado com EPUBs reais do Project Gutenberg. Veja `research/CATALOG-API.md`.

## Estatísticas de leitura

Abra **Estatísticas** na navegação. O painel mostra:

- Minutos e horas por dia, semana, mês e ano, com gráficos por hora/dia/mês.
- Sequência atual e recorde de dias lendo, com mínimo de um minuto por dia. Se ainda não leu hoje, a sequência de ontem permanece até o dia acabar.
- Meta diária ajustável, dias de meta atingida e sequência/recorde da meta.
- Média diária, sessões, duração média, melhor dia, tempo por livro, faixas de horário e calendário das últimas treze semanas.
- Comparação com o período anterior usando dias correspondentes efetivamente registrados em ambos. Dias antes da ativação são desconhecidos, não zeros.
- Média histórica de dias completos desde a ativação, incluindo dias sem leitura. Hoje e o dia da ativação após meia-noite ficam fora dessa média.
- Exportação diária CSV e registros completos JSON pelo seletor nativo.

A contagem começa quando o livro está carregado e visível, com o app em primeiro plano. Chat, painéis, anotações em edição, preferências, segundo plano e bloqueio de tela pausam. Leitura silenciosa pausa após dois minutos sem interação; ajuste para 1/2/5/10 min em **Meta e contagem**. Toque, role ou vire a página para retomar. Voz é separada e também requer primeiro plano. Isso mede tempo de uso ativo do leitor, não movimento dos olhos. Um intervalo de suspensão/relógio alterado não é convertido em horas lidas.

Registros usam relógio monotônico para duração e horário local do aparelho para dias/horas, com divisão correta em viradas de hora, meia-noite e horário de verão. São gravados a cada cinco segundos e ao sair/pausar; uma interrupção abrupta do sistema pode perder a fração ainda não gravada. Leituras anteriores à instalação da versão 0.2.0 não são estimadas. Excluir um livro preserva seu histórico de tempo para as médias. Estatísticas ficam exclusivamente no aparelho e não são enviadas à OpenAI.

## Conversar sobre um EPUB

1. Abra **Preferências** e insira sua chave da API OpenAI. A chave fica cifrada com AndroidKeyStore/AES-GCM no Android (ou `safeStorage` no Electron) e não é entregue à interface.
2. Escolha o identificador de modelo disponível para sua conta. Padrão: **`gpt-5-nano`**, o menor preço por token entre os modelos de texto consultados na [tabela oficial](https://developers.openai.com/api/docs/pricing) em 12/10/2026: US$ 0,05 por milhão de entrada e US$ 0,40 de saída. Usa esforço de raciocínio mínimo. A atualização troca o antigo padrão GPT-6 Astra pelo econômico, preservando a chave cifrada.
3. Abra um livro e clique **Conversar**. Pergunte sobre o texto ou selecione uma passagem e escolha “Perguntar à IA”.
4. A busca local por palavras-chave recupera até oito trechos e envia as últimas oito mensagens (até 6.000 caracteres por mensagem); a resposta solicita referências `[1]`, `[2]`. Os botões de contexto abrem os capítulos enviados ao modelo.

O chat usa a **API da OpenAI**, com cobrança própria. A assinatura do ChatGPT não fornece automaticamente crédito de API. Os livros permanecem locais; somente histórico da conversa, título, seleção e trechos recuperados são enviados quando uma pergunta é feita. `store:false` é usado nas Responses; isso não elimina outras políticas aplicáveis do provedor. A recuperação não lê exaustivamente livros longos e pode perder correspondências semânticas. Confira as fontes: o modelo pode errar. As conversas são salvas apenas junto ao livro no dispositivo.

## Dados e segurança

Dados ficam em IndexedDB no perfil privado do Folio no aparelho. A chave fica em preferências privadas cifradas com AndroidKeyStore; não é entregue à interface. Não são pedidas permissões amplas de acesso ao armazenamento. Importação usa o seletor de arquivos e exportação de notas usa o seletor nativo do Android.

Excluir um livro remove seu EPUB, notas e conversa da biblioteca. Guarde cópias dos EPUBs originais: limpar os dados do app ou desinstalá-lo apaga os dados locais.

Importação valida ZIP/XML, limita recursos, remove scripts/frames/formulários/URLs remotas e CSS ativo dos EPUBs. Fontes embutidas via CSS e elementos fora da lista permitida podem ser omitidos. O leitor usa frames sem scripts e política de conteúdo local. A versão Electron também usa sandbox e isolamento de contexto. Downloads limitam tamanho/tempo, verificam HTTPS, DNS e cada redirecionamento, recusando redes privadas.

## Escopo

A versão 0.2.0 entrega o fluxo principal de EPUB, estatísticas e catálogo nativo. Não fornece sincronização entre dispositivos, loja Amazon, Kindle Unlimited, leitura de AZW/KFX/MOBI/PDF, remoção de DRM, X-Ray, destaques populares, tradução integrada ou audiolivros. O dicionário abre uma consulta externa. A página pública do Kindle foi inspecionada com REA; o aplicativo nativo não estava instalado e não foi decompilado. A matriz e as evidências ficam em `research/REA.md`.

## Verificar e gerar o aplicativo

```sh
npm run build
npx playwright install chromium
npm test
npm run android:build
```

Instale o navegador de testes e execute a suíte:

```sh
npx playwright install chromium
npm test
```

Testes de backend incluem chamada real do SDK contra resposta simulada, sem chave real e sem gastos. Testes do desktop verificam o leitor EPUB renderizado, importação, progresso, anotações, preferência e barreira de configuração do chat. Uma resposta real da OpenAI só pode ser validada após configurar uma chave com acesso/saldo.

## Leitura e áudio (0.5.0)

Toque no ícone de voz no leitor para escolher capítulo, idioma, voz e velocidade (0,5–2×). Use “A partir do parágrafo atual” ou selecione texto e toque em “Ouvir seleção”. O temporizador oferece 5, 15, 30 e 60 minutos. “Voltar ao texto neste trecho” posiciona o EPUB e mantém um player compacto; “Encerrar” interrompe a voz. O Android usa um serviço de reprodução em primeiro plano e uma notificação com opção de parar. Instale as vozes desejadas nas configurações de texto para fala do aparelho. Algumas vozes exigem internet. A precisão de retomada depende dos eventos de progresso fornecidos pelo mecanismo TTS. A narração é sintética; o app não incorpora o serviço ou catálogo do Audible.

No modo paginado: pinça ajusta a fonte entre 14 e 36; toque no quarto direito/esquerdo da página avança/volta; deslize horizontal muda a página. Links, seleção de texto e leitura com rolagem conservam seus próprios gestos.

A navegação inferior reúne Biblioteca, Descobrir, Próximas, Estatísticas e Mais. Favoritos, concluídos, notas e preferências ficam em Mais. As sugestões usam leituras começadas e autores/temas dos favoritos e concluídos da própria biblioteca, com explicação do motivo.

As estatísticas incluem calendário, tempo ativo sem inatividade, comparações históricas, retrospectivas, ritmo e conclusão estimados. A estimativa pessoal exige pelo menos um minuto e avanço registrado após a atualização. Até existir histórico suficiente, o tempo do capítulo usa uma referência explícita de 200 palavras/minuto. Tema, idioma, palavras aprendidas e revisão de grifos podem ser registrados na seção Perfil de leitura. Tempo ouvido em segundo plano ainda não entra nas métricas: os registros de voz continuam restritos ao primeiro plano.

## Player e visual minimalista (0.6.0)

O player ocupa a tela, com capa, capítulo, progresso e botões para ouvir/pausar, anterior/próximo e saltos de cerca de 30 segundos. Tempos e saltos são estimados a partir das palavras e velocidade, pois TTS não fornece duração exata. A opção “Texto acompanha o áudio” vem ligada: o progresso da voz é convertido em CFI e só muda de página quando o trecho sai da área visível. A precisão depende dos eventos de progresso do mecanismo Android. Voz, idioma e timer ficam nas opções; velocidade e troca de capítulo preservam reprodução quando já estiver ouvindo. Marcação grava o marcador da página do EPUB. “Voltar ao texto neste trecho” minimiza o player.

No leitor, toque em **Tela cheia** (ícone de expandir). Menus somem e o texto usa quase toda a tela, com bordas pequenas e localização/porcentagem no rodapé. Toque no centro para mostrar controles; laterais e deslize continuam virando páginas. No Android, barras do sistema são ocultadas e podem ser mostradas temporariamente com gesto da borda. Ao sair do leitor, são restauradas.

A biblioteca abre em visual minimalista escuro, com busca e capas. No ícone de controles ao lado do título, ajuste **Tamanho das capas**; a escolha fica salva. Desmarque **Visual minimalista** para recuperar o visual anterior. O ícone de setas ordena e + importa EPUB. Preferências e coleções estão em **Mais** no celular.

## Correções de narração (0.6.1)

A barra e o contador avançam a cada 200 ms enquanto a voz toca, recebem correções dos eventos de progresso do mecanismo e ficam parados na pausa. Na ausência de eventos finos, a posição é estimada pelo tempo. A barra usa segundos e permite buscar dentro de uma frase; retomar usa a posição textual conhecida.

Títulos, subtítulos, parágrafos, listas e citações mantêm separações de bloco na extração. Não se funde o título com o parágrafo seguinte. No Android há pausas explícitas de 600 ms após blocos curtos e 300 ms após os demais; blocos de fala são menores. Abreviações, decimais e caracteres Unicode são preservados. Duração e busca continuam estimadas, conforme o mecanismo TTS escolhido.

## Estatísticas e temas (0.7.0)

Em **Mais → Preferências → Tema do aplicativo**, escolha **Claro** ou **Escuro**. A escolha é aplicada à biblioteca, busca, estatísticas, diálogos, leitor e player, fica salva e ajusta também as barras do Android. Os controles de cor do leitor oferecem os mesmos dois temas; a escolha no leitor também atualiza o restante do app. Preferências antigas de sépia são compatíveis no armazenamento, mas deixam de ser uma terceira opção visual.

Estatísticas usam quatro abas: **Visão geral** (sequência, semana, meta diária, desafio anual e resumo), **Histórico** (comparações, calendário, sessões/exportação e retrospectivas), **Livros** (tempo, progresso e previsões com abertura do livro) e **Perfil** (distribuições de temas/idiomas/autores/formatos, notas e aprendizado). Toque em um dia da sequência para ver seu histórico. Meta anual de livros é configurada junto da meta diária; conclusões anuais usam livros distintos registrados nas métricas. Alterar a apresentação não recalcula nem apaga registros existentes.

## Credenciais e assinatura

Nenhuma chave OpenAI ou Anna’s Archive é distribuída com o projeto. Cada usuário configura as próprias chaves em Preferências; o Android usa criptografia do sistema para armazená-las. Nunca inclua chaves, bancos de dados pessoais, capturas com credenciais, `.env` ou material de assinatura em commits. Os testes usam credenciais fictícias, sem acesso a contas reais.

A chave privada de assinatura dos APKs oficiais não está no repositório. Uma compilação local gera sua própria chave em `.toolchain/`; APKs com outra assinatura não atualizam a instalação oficial. Mantenha sua chave local em backup privado e nunca publique o keystore nem sua senha.
