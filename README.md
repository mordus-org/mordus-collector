<div align="center">

# Mordus Collector

**SDK JavaScript para coleta de eventos no navegador**

[![Node.js](https://img.shields.io/badge/Node.js-22.12%2B%20%7C%2024%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-SDK-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

## Sobre

O Mordus Collector acompanha eventos no navegador e os envia para um endpoint definido pela aplicação. É independente de framework e pode ser integrado a projetos JavaScript ou TypeScript.

## Início

Instale o pacote:

```bash
npm install @mordus/monitor
```

Explore os exemplos para ver o SDK em uso.

## Exemplos

- [Vanilla](examples/vanilla-app/index.html) — integração com JavaScript puro.
- [Shopping](examples/shopping-app/index.html) — loja de demonstração com coleta de eventos.

## Desenvolvimento

Requer Node.js 22.12 ou superior na linha 22, ou Node.js 24 ou superior. Instale as dependências e execute os comandos:

```bash
npm ci
npm run build
npm test
```

Para iniciar os exemplos localmente, use `npm run example` ou `npm run example:shopping`.

Veja a [documentação do transporte HTTP](src/transport/README.md) para detalhes sobre o endpoint que recebe os eventos.
