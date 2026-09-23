# WebApê

Maquete 3D de apartamento ou casa para testar cores de parede antes de pintar. Você monta a planta (ou usa a que vem pronta), gira a maquete em 3D e pinta cada parede com cores reais do catálogo **Suvinil**.

O app inteiro é um único arquivo, `index.html`: HTML, CSS e JavaScript puros, com WebGL feito à mão. Não tem build, dependências nem servidor. Os dados ficam no `localStorage` do navegador.

---

## O que dá para fazer

### Projetos
- A tela inicial lista seus projetos. Cada projeto é uma planta pintada, e as cores de um projeto não interferem nas de outro.
- **Novo projeto** a partir de um modelo: o *Apartamento* que já vem no app ou um modelo criado por você.
- Os projetos podem ser renomeados (clique no nome) e excluídos.
- Tudo é salvo sozinho no navegador.

### Pintura (visualizador 3D)
- **Girar** arrastando, **mover** com Ctrl + arraste (ou botão direito, ou dois dedos), **zoom** com a roda do mouse. A câmera fica presa numa área em volta da planta.
- Clique numa parede para selecionar a face e escolha a tinta. Cada lado da parede tem cor própria.
- **Só esta face** ou **Cômodo inteiro** (pinta todas as paredes internas do cômodo).
- **Meia parede:** pinte só a parte de baixo ou só a de cima, com a altura da divisão ajustável.
- **Paleta Suvinil:** 2.362 cores reais, com busca por nome ou código e filtro por família. Um código hex digitado vira a **Suvinil mais próxima** (distância em CIELAB).
- Histórico das 6 últimas cores usadas, **Desfazer** e **Esquemas salvos** (cópias com nome, para comparar opções).
- **Piso:** porcelanato, cimento queimado ou madeira, com textura procedural.
- **Corte:** baixa a altura das paredes para enxergar o interior.

### Editor de modelos
Em *Criar novo modelo*, você desenha a planta vista de cima.

- **Piso:** arraste no vazio para desenhar um cômodo retangular. Arraste um piso por dentro para movê-lo; pegue perto da borda, por dentro, para redimensionar. Começar na linha da borda (ou por fora) desenha um cômodo vizinho colado.
  - Pisos **não podem se sobrepor** e **todos precisam estar conectados** entre si por uma borda.
- **Parede:** pode ser **inteira (2,70 m)** ou **meia (1,10 m)** e sempre fica **sobre um piso**.
  - Pode começar ou terminar na ponta, no meio ou em qualquer ponto de outra parede, ou num canto de piso.
  - Pode ser **diagonal**. O ângulo gruda em 0°/45°/90° quando está perto, e **Shift** força esses ângulos.
- **Paredes no contorno:** cria de uma vez as paredes de todas as bordas dos pisos.
- **Porta** (0,80 m) e **Janela** (1,20 m): clique numa parede. Depois dá para arrastar ao longo dela e ajustar as medidas no painel. Meia parede não aceita janela.
- **Cadeado:** no centro de cada piso, e no meio da parede selecionada. Trava contra mover, redimensionar e excluir.
- **Ver em 3D** para conferir a maquete antes de salvar.
- **Concluir modelo:** salva o modelo no WebApê e baixa um arquivo `.webape.json`.
- O rascunho é salvo sozinho: se você sair no meio, o botão vira *Continuar rascunho*.
- Na home, cada modelo tem **Baixar .json**, e o botão **Importar .json** traz um modelo de outro navegador.

#### Atalhos do editor
| Tecla | Ação |
|---|---|
| `V` `P` `W` `D` `J` | Selecionar · Piso · Parede · Porta · Janela |
| `Ctrl+Z` / `Ctrl+Shift+Z` (ou `Ctrl+Y`) | Desfazer / refazer |
| `Delete` / `Backspace` | Excluir o selecionado |
| Setas (`Shift` = 0,50 m) | Mover o selecionado de 5 em 5 cm |
| `Esc` | Cancelar e soltar a seleção |
| `Shift` ao desenhar parede | Travar o ângulo em múltiplos de 45° |

#### Atalhos do visualizador
| Tecla | Ação |
|---|---|
| `R` | Vista inicial |
| `C` | Centralizar |
| `N` | Mostrar/ocultar nomes dos cômodos |
| `Esc` | Soltar a seleção |

---

## Como rodar

Não tem instalação. Qualquer uma das opções abaixo funciona:

1. **Abrir o arquivo direto:** dê dois cliques em `index.html`.
2. **Servidor local** (recomendado para testar downloads e importação):
   ```bash
   node .claude/serve.js
   ```
   e abra `http://localhost:5180`.

> `serve.js` é só um ajudante de desenvolvimento local e não deve ser exposto na rede.

O app também está publicado como Artifact no claude.ai. Lá, o download do `.json` passa pela confirmação de download do próprio claude.ai (capacidade `downloads`).

---

## Como usar

### Pintar o apartamento que já vem pronto
1. Na tela inicial, em **Novo projeto**, clique em **Usar este modelo** no cartão *Apartamento*. O visualizador 3D abre.
2. Escolha uma cor na **Paleta Suvinil**. Dá para buscar pelo nome ("sálvia") ou pelo código ("A203"), ou filtrar por família.
3. Clique nas paredes para pintar. Com uma cor ativa, cada clique pinta a face clicada.
   - Para pintar todas as paredes de um cômodo de uma vez, selecione **Cômodo inteiro** antes de clicar, ou clique no nome do cômodo na lista **Cômodos**.
   - Para fazer uma barra ou meia parede, escolha **Parte de baixo** e ajuste a **Altura**.
4. Troque o **Piso** e use o **Corte** para olhar dentro dos cômodos.
5. Clique em **← Projetos** para voltar. O projeto já está salvo.

Para só selecionar uma parede sem pintar, clique de novo na cor ativa para desativá-la.

### Comparar opções de cor
1. Pinte uma versão e, em **Esquemas salvos**, dê um nome (ex.: "opção sálvia") e clique em **Salvar**.
2. Pinte outra versão e salve com outro nome.
3. Clique num esquema da lista para voltar a ele. A troca pode ser desfeita com **Desfazer**.

### Montar a sua própria planta
1. Na tela inicial, clique em **Abrir editor** no cartão *Criar novo modelo* e dê um nome ao modelo no topo.
2. Com a ferramenta **Piso**, arraste para desenhar o primeiro cômodo. Desenhe os demais colados a ele: comece na borda de um piso existente e o ímã encaixa.
3. Clique num piso e, no painel, dê o nome do cômodo (Sala, Quarto, Banheiro…). Nomes de banheiro, cozinha e similares marcam **Área molhada** sozinhos.
4. Clique em **Paredes no contorno** para criar todas as paredes das bordas de uma vez.
5. Com a ferramenta **Parede**, acrescente divisórias, que podem sair do meio de outra parede ou ser diagonais. Selecione uma parede para trocar entre **Inteira** e **Meia**.
6. Com as ferramentas **Porta** e **Janela**, clique nas paredes onde elas ficam. Depois dá para arrastar ao longo da parede.
7. Use o **cadeado** para travar o que já está certo, assim nada sai do lugar sem querer.
8. Clique em **Ver em 3D** para conferir e em **← Voltar ao editor** para continuar ajustando.
9. Clique em **Concluir modelo**. O modelo aparece em **Novo projeto** e um arquivo `.webape.json` é baixado.
10. Clique em **Usar este modelo** no cartão novo e pinte como no apartamento pronto.

Se algo não puder ser feito (piso solto, parede fora do piso, janela em meia parede…), a barra de status do editor explica o motivo e a peça volta para onde estava.

### Levar um modelo para outro navegador ou computador
1. No cartão do modelo, clique em **Baixar .json**. O arquivo também é baixado ao concluir o modelo.
2. No outro navegador, abra o WebApê e clique em **Importar .json** no cartão *Criar novo modelo*.

Os projetos (as cores pintadas) ficam só no navegador onde foram feitos. O `.json` leva a planta, não a pintura.

---

## Estrutura dos arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O app completo (home, visualizador 3D, editor, paleta embutida). |
| `paleta-suvinil.json` | Catálogo tratado: `[nome, código, hex sem #, índice da família]`. É o mesmo conteúdo embutido em `index.html`. |
| `suvinil-cores.json` | Resposta bruta da API da Suvinil (2.540 cores), usada como entrada do tratamento. |
| `baixar-cores.js` | Baixa o catálogo bruto da API da Suvinil. |
| `gerar-paleta.js` | Filtra (tira vernizes, metálicos etc.), remove duplicados e classifica por família. |
| `.claude/serve.js` · `.claude/launch.json` | Servidor estático de desenvolvimento. |

### Atualizar o catálogo de cores
```bash
node baixar-cores.js     # gera suvinil-cores.json (254 páginas, ~1 min)
node gerar-paleta.js     # gera paleta-suvinil.json
```
Depois, substitua em `index.html` o conteúdo da linha `const CORES = [...];` pelo conteúdo de `paleta-suvinil.json`. A paleta fica embutida no HTML para o app funcionar sem rede.

A API da Suvinil pagina a partir de `page=1` (`page=0` retorna erro) e ignora filtros. As famílias cromáticas (Brancos, Cinzas, Azuis…) não vêm da API: são calculadas a partir do RGB, por matiz e luminosidade.

---

## Formato do modelo (`.webape.json`)

```json
{
  "formato": "webape-modelo",
  "versao": 1,
  "id": "m_...",
  "nome": "Minha casa",
  "criadoEm": "2026-09-23T12:00:00.000Z",
  "atualizadoEm": "2026-09-23T12:00:00.000Z",
  "pisos": [
    { "id": "f_...", "nome": "Sala", "x": 0, "z": 0, "w": 5, "d": 4, "molhado": false, "travado": false }
  ],
  "paredes": [
    { "id": "w_...", "x1": 0, "z1": 0, "x2": 5, "z2": 0, "altura": "inteira",
      "travado": false,
      "aberturas": [ { "id": "a_...", "tipo": "porta", "pos": 1.6, "largura": 0.8 } ] }
  ]
}
```

- As medidas estão em **metros**. O eixo `x` vai para a direita e o `z` para baixo, como numa planta vista de cima.
- `pisos`: retângulos alinhados aos eixos. `(x, z)` é o canto superior esquerdo, `w` a largura e `d` o comprimento.
- `paredes`: segmento de `(x1,z1)` a `(x2,z2)`, que pode ser diagonal. `altura` vale `"inteira"` (2,70 m) ou `"meia"` (1,10 m).
- `aberturas[].pos`: distância, a partir de `(x1,z1)`, até o início da porta ou janela.
  - Porta: vão até 2,10 m.
  - Janela: peitoril a 1,00 m e topo a 2,20 m.

Na importação, o arquivo é normalizado (números, textos, ordem das pontas) e validado com as mesmas regras do editor. Um arquivo inválido é recusado com o motivo.

---

## Dados no navegador (`localStorage`)

| Chave | Conteúdo |
|---|---|
| `apto-projetos-v1` | Índice de projetos (nome, modelo, datas). |
| `apto-projeto-dados-<id>` | Cores, meia parede, piso, recentes e esquemas de cada projeto. |
| `apto-modelos-v1` | Modelos criados no editor. |
| `apto-modelo-rascunho` | Rascunho do editor em andamento. |
| `apto-cores-v3` | Formato antigo, de projeto único. É migrado automaticamente para um projeto "Apartamento" na primeira abertura. |

Limpar os dados do site no navegador apaga tudo isso. Para guardar um modelo, baixe o `.json`.

---

## Limitações conhecidas

- **Modelos concluídos não podem ser editados.** As cores dos projetos ficam ligadas a cada parede pela posição na lista, e editar a planta embaralharia a pintura. Para "editar", importe o `.json`, crie outro modelo e comece um projeto novo.
- **Pisos são sempre retangulares.** Cômodos em L são montados com dois pisos colados.
- **Paredes no contorno** só gera paredes retas. As diagonais são desenhadas à mão.
- No 3D, junções de paredes diagonais são encaixes simples, sem chanfro.
- Um modelo tem até 60 pisos e 250 paredes.
- As cores na tela são aproximações. A tinta real varia com a iluminação, o acabamento e o monitor.

---

## Créditos

Nomes, códigos e cores vêm do catálogo público da **Suvinil** (`suvinil.com.br`). O WebApê não tem vínculo com a marca.
