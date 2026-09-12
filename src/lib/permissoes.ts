// Chaves de permissão do ERP — espelham a tabela `permissions` no banco.
// Tipar aqui evita que um typo (`os.editer`) vire silenciosamente "sem
// permissão" na tela inteira.

export const PERMISSOES = [
  'administrativo.clientes.gerenciar',
  'administrativo.fornecedores.gerenciar',
  'administrativo.usuarios.gerenciar',
  'estoque.entradas.processar',
  'estoque.produtos.gerenciar',
  'financeiro.gerenciar',
  'fiscal.gerenciar',
  'os.criar',
  'os.editar',
  'os.excluir',
  'os.servicos.gerenciar',
  'relatorios.ver',
] as const

export type Permissao = (typeof PERMISSOES)[number]
