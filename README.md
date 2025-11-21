# 🎓 Portal de Avaliações CEJA

<div align="center">
  
![React](https://img.shields.io/badge/React-19.2.0-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-2.39-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

**Sistema completo de gestão de avaliações online para instituições de ensino**

[Demo](#) · [Reportar Bug](https://github.com/BronksDEV/quests/issues) · [Solicitar Feature](https://github.com/BronksDEV/quests/issues)

</div>

---

## 📋 Sobre o Projeto

O **Portal de Avaliações CEJA** é uma plataforma moderna e intuitiva desenvolvida para o Colégio Estadual José Abílio, permitindo a criação, gestão e aplicação de avaliações online de forma segura e eficiente.

### ✨ Principais Funcionalidades

#### 👨‍🎓 Para Alunos
- ✅ Interface intuitiva e responsiva
- ✅ Visualização de avaliações disponíveis por área de conhecimento
- ✅ Sistema de controle de acesso baseado em horários
- ✅ Modo tela cheia obrigatório com proteção contra fraudes
- ✅ Feedback visual de conclusão de avaliações

#### 👨‍🏫 Para Professores
- ✅ Editor de provas completo com preview em tempo real
- ✅ Suporte a rich text (negrito, itálico, listas, imagens)
- ✅ Upload de imagens para questões
- ✅ Controle granular de acesso (liberação global ou individual)
- ✅ Dashboard de resultados com análise por disciplina
- ✅ Sistema de segunda chamada

#### 🔐 Segurança
- ✅ Autenticação via Supabase Auth
- ✅ Controle de sessão com timeout automático
- ✅ Proteção contra saída do modo tela cheia
- ✅ Bloqueio automático em caso de violação de regras
- ✅ Row-Level Security (RLS) no banco de dados

---

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React 19.2** - Biblioteca UI
- **TypeScript 5.8** - Tipagem estática
- **Vite 6.2** - Build tool e dev server
- **TailwindCSS** - Framework CSS

### Backend
- **Supabase** - Backend-as-a-Service
  - PostgreSQL Database
  - Authentication
  - Storage (imagens)
  - Real-time subscriptions
  - Edge Functions

### Outras Bibliotecas
- `@supabase/supabase-js` - Cliente Supabase
- `react-dom` - Renderização React

---

## 🚀 Começando

### Pré-requisitos

- Node.js 18.x ou superior
- npm ou yarn
- Conta no Supabase

### Instalação

1. **Clone o repositório**
```bash