import JSZip from "jszip";
import { writeFile } from "node:fs/promises";

const sections = [
  {
    title: "Um lugar para a atenção",
    paragraphs: [
      "A leitura começa antes da primeira frase. Começa no pequeno acordo que fazemos com o tempo: durante alguns minutos, uma página será suficiente. Não precisamos terminar um capítulo nem justificar esse intervalo com uma meta. Basta deixar o livro aberto e conceder ao texto uma chance de nos encontrar.",
      "Escolher um lugar ajuda porque o ambiente também conversa conosco. Uma cadeira confortável, luz que não force os olhos e um copo de água diminuem as pequenas interrupções. Nada disso exige uma sala perfeita. A atenção aprende a morar em lugares comuns quando voltamos a eles com alguma regularidade.",
      "O telefone pode ficar do outro lado da mesa, com as notificações desligadas. O gesto não resolve toda distração, mas cria uma distância útil entre o impulso e a ação. Quando a mão procura a tela e encontra apenas a madeira, temos um instante para decidir se queremos continuar lendo.",
      "Há dias em que duas páginas parecem longas. O cansaço não deve ser tratado como uma falha moral. Podemos ler um parágrafo, fechar os olhos e perguntar o que ficou. Retomar a mesma passagem amanhã também é leitura: o texto permanece disponível enquanto nosso ritmo muda.",
      "Uma rotina pequena costuma sobreviver melhor do que uma promessa grandiosa. Dez minutos depois do café podem ser mais sustentáveis do que uma hora que nunca chega. A repetição associa um gesto cotidiano à abertura do livro e reduz o trabalho de decidir a cada dia.",
      "A velocidade de leitura varia com o propósito. Procurar um endereço em um manual pede rapidez; acompanhar uma imagem poética pede demora. Ler devagar não significa adotar um único ritmo. Significa perceber quando uma frase merece que o passo diminua.",
      "Também podemos reconhecer as distrações sem segui-las imediatamente. Anotar uma tarefa em um papel evita que ela precise ser repetida pela memória enquanto lemos. Essa lista provisória não é um plano de produtividade; é apenas um lugar de espera para assuntos que chegaram cedo demais.",
      "Ao terminar a sessão, convém guardar uma pergunta junto com o marcador. O que esta passagem mudou em minha compreensão? Que palavra ainda não entendi? A pergunta cria uma ponte entre hoje e a próxima abertura do livro, sem transformar o descanso em uma obrigação.",
    ],
  },
  {
    title: "Conversar com uma página",
    paragraphs: [
      "Um livro não precisa concordar conosco para ser uma boa companhia. Quando uma frase provoca resistência, podemos examinar primeiro o que ela afirma. Separar a afirmação de nossa resposta impede que uma discordância apressada esconda uma ideia que merecia ser compreendida.",
      "Sublinhar é escolher. Se toda a página recebe uma marca, nenhuma passagem se destaca das demais. Vale perguntar por que um trecho chamou nossa atenção: ele apresenta uma tese, oferece um exemplo, muda a direção do argumento ou apenas soa bonito?",
      "Uma nota curta pode registrar a função do trecho. Escrever exemplo ou objeção ao lado de uma passagem é diferente de copiar suas palavras. A nota guarda uma relação que percebemos, e essa relação será valiosa quando retornarmos à página semanas depois.",
      "As perguntas mais úteis costumam ser específicas. Em vez de perguntar o que o capítulo quer dizer, podemos perguntar como o exemplo do rio sustenta a conclusão do autor. A precisão não diminui a conversa. Ela oferece um ponto concreto de onde outras questões podem partir.",
      "Um assistente de inteligência artificial pode ajudar a comparar passagens ou explicar termos. Sua resposta deve ser tratada como uma hipótese a conferir no livro. Se ele atribui uma ideia ao autor, precisamos localizar a passagem que sustenta essa atribuição e verificar se o contexto foi preservado.",
      "A diferença entre citação e interpretação merece atenção. Uma citação reproduz palavras que podemos encontrar no texto; uma interpretação propõe uma leitura dessas palavras. Misturar as duas faz uma opinião parecer evidência. Nomear cada uma permite discordar com clareza.",
      "Às vezes uma palavra desconhecida interrompe o caminho. Podemos marcá-la e continuar até que o contexto ofereça uma pista. Outras vezes ela organiza o argumento inteiro, e então pesquisar seu sentido vale a pausa. A decisão depende do trabalho que a palavra faz naquela página.",
      "Conversar com o texto inclui aceitar perguntas sem resposta imediata. Algumas ficam mais nítidas depois de outro capítulo. Outras só mudam quando levamos a ideia para uma experiência concreta. O livro oferece linguagem para pensar; a experiência testa onde essa linguagem alcança.",
    ],
  },
  {
    title: "O que a memória conserva",
    paragraphs: [
      "Fechar um livro e tentar contar o que acabou de ler revela algo que a releitura silenciosa pode esconder. Reconhecer uma frase quando ela reaparece é mais fácil do que recuperá-la sem ajuda. A tentativa de explicação mostra os pontos fortes e os buracos de nossa compreensão.",
      "Não é necessário produzir um resumo elegante. Três frases provisórias bastam: qual era a questão, qual resposta o autor apresentou e que exemplo sustentou a resposta. Se uma dessas frases não vem, podemos voltar ao texto com uma tarefa definida.",
      "A memória conserva relações melhor do que uma fila de detalhes soltos. Associar uma ideia nova a uma pergunta antiga dá a ela um lugar. Essa associação precisa ser examinada, pois uma semelhança aparente pode ocultar diferenças importantes entre dois argumentos.",
      "Revisitar uma nota em dias diferentes pode ser mais útil do que lê-la muitas vezes no mesmo minuto. O intervalo exige reconstruir o caminho e torna visível o que ainda precisa de apoio. Nenhum calendário funciona igualmente para todos; a prática pode começar com um retorno simples na semana seguinte.",
      "Explicar uma passagem a outra pessoa também muda o trabalho de leitura. Quando escolhemos palavras comuns, descobrimos quais termos entendíamos apenas por familiaridade. Uma pergunta do ouvinte pode revelar que saltamos uma etapa entre a premissa e a conclusão.",
      "Uma biblioteca pessoal cresce junto com seus caminhos de acesso. Títulos, autores, coleções e notas ajudam a reencontrar uma ideia. Organizar não precisa consumir o tempo que seria dedicado à leitura. Uma etiqueta que responde a uma necessidade concreta é suficiente para começar.",
      "Os destaques ficam mais úteis quando conservam a origem. Uma frase sem capítulo ou indicação do livro pode perder seu contexto. Guardar o lugar da passagem permite conferir, citar com cuidado e perceber se uma nova leitura muda a interpretação anterior.",
      "Esquecer parte do que lemos não torna o encontro inútil. Um livro pode modificar uma pergunta, oferecer uma imagem ou tornar uma distinção disponível anos depois. A memória não é um depósito perfeito. É uma atividade que reconstrói e seleciona enquanto voltamos a pensar.",
    ],
  },
  {
    title: "Uma biblioteca que continua",
    paragraphs: [
      "A melhor biblioteca para uma pessoa pode ser pequena e mutável. Há livros aos quais voltamos, livros que consultamos e livros que ainda não encontramos tempo de ler. Essas categorias descrevem relações presentes; não são classificações permanentes de valor.",
      "Abandonar uma leitura pode ser uma decisão cuidadosa. Podemos registrar onde paramos e o motivo: o tema perdeu relevância, o momento não ajudou ou a exposição exigia conhecimentos que ainda faltam. O registro facilita uma retomada futura sem exigir que ela aconteça.",
      "Ler em formato digital oferece ajustes que podem diminuir barreiras. Aumentar a fonte, mudar o espaçamento e escolher um contraste confortável transforma a mesma página em experiências distintas. O ajuste correto é aquele que permite acompanhar o texto com menos esforço.",
      "A navegação por capítulos, a busca e os marcadores apoiam maneiras diferentes de ler. Um romance pode convidar a seguir a ordem; um ensaio pode pedir retornos constantes. A ferramenta deve ajudar esse movimento, sem presumir que toda leitura seja uma marcha uniforme do começo ao fim.",
      "Guardar os próprios arquivos e poder exportar notas oferece continuidade quando uma ferramenta muda. Formatos abertos permitem trocar de programa com menos trabalho. Essa possibilidade não elimina o cuidado com backups, mas diminui a dependência de um único lugar.",
      "Uma conversa sobre o livro fica mais confiável quando mostra de onde vieram suas afirmações. Links para capítulos e trechos permitem voltar à fonte. Se apenas algumas passagens foram examinadas, convém dizer isso: uma amostra pode apoiar uma discussão sem representar o livro inteiro.",
      "A leitura compartilhada não exige consenso. Duas pessoas podem escolher passagens diferentes e explicar o que encontraram nelas. Ouvir a escolha do outro amplia nossa atenção porque mostra detalhes que estavam presentes, mas não haviam recebido um lugar em nossa interpretação.",
      "Ao fechar esta pequena obra, podemos escolher um gesto concreto para a próxima leitura. Preparar o lugar, guardar uma pergunta, escrever três frases de memória ou conferir uma interpretação no capítulo são possibilidades. O gesto vale quando abre espaço para um novo encontro com as palavras.",
    ],
  },
];
const zip = new JSZip();
zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
zip.file(
  "META-INF/container.xml",
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
);
const items = sections
  .map(
    (_, i) =>
      `<item id="c${i}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
  )
  .join("");
zip.file(
  "OEBPS/content.opf",
  `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:folio:original-demo-1</dc:identifier><dc:title>A arte de ler devagar</dc:title><dc:creator>Folio · texto de demonstração</dc:creator><dc:language>pt-BR</dc:language><dc:rights>Texto original de demonstração, distribuído sob licença MIT.</dc:rights><meta property="dcterms:modified">2026-10-12T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/><item id="style" href="style.css" media-type="text/css"/>${items}</manifest><spine>${sections.map((_, i) => `<itemref idref="c${i}"/>`).join("")}</spine></package>`,
);
zip.file(
  "OEBPS/nav.xhtml",
  `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head><body><nav epub:type="toc"><h1>Sumário</h1><ol>${sections.map((s, i) => `<li><a href="chapter${i + 1}.xhtml">${s.title}</a></li>`).join("")}</ol></nav></body></html>`,
);
zip.file(
  "OEBPS/style.css",
  "body { font-family: Georgia, serif; line-height: 1.7; padding: 0 4%; } h1 { font-weight: normal; line-height: 1.2; margin-bottom: 1.6em; } p { text-indent: 1.2em; margin: .5em 0; } .chapter-number { text-indent: 0; font-size: .8em; letter-spacing: .15em; text-transform: uppercase; }",
);
for (const [i, s] of sections.entries())
  zip.file(
    `OEBPS/chapter${i + 1}.xhtml`,
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR"><head><title>${s.title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><p class="chapter-number">Capítulo ${i + 1}</p><h1>${s.title}</h1>${s.paragraphs.map((p) => `<p>${p}</p>`).join("")}</body></html>`,
  );
zip.file(
  "OEBPS/cover.svg",
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#b85c3c"/><rect x="34" y="34" width="532" height="832" rx="4" fill="none" stroke="#f5ddad" stroke-width="2"/><path d="M110 660 C220 570 260 730 340 610 C420 510 450 660 490 560" fill="none" stroke="#f5ddad" stroke-width="4"/><circle cx="300" cy="160" r="46" fill="#f5ddad"/><path d="M275 146 L300 138 L325 146 L325 180 L300 172 L275 180 Z" fill="#b85c3c"/><text x="300" y="340" font-family="Georgia,serif" font-size="58" fill="#fff2d8" text-anchor="middle">A arte de</text><text x="300" y="415" font-family="Georgia,serif" font-size="58" fill="#fff2d8" text-anchor="middle">ler devagar</text><text x="300" y="790" font-family="sans-serif" font-size="17" letter-spacing="4" fill="#f5ddad" text-anchor="middle">FOLIO · EDIÇÃO ORIGINAL</text></svg>',
);
await writeFile(
  new URL("../public/sample.epub", import.meta.url),
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);
console.log("sample.epub gerado: 4 capítulos, 32 parágrafos originais.");
