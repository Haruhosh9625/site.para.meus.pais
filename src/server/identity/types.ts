import type { Role } from "@prisma/client";

/**
 * Contrato do provedor de identidade.
 *
 * Quem guarda e confere a SENHA fica atrás desta interface. Duas
 * implementações:
 *
 *   • supabase — o Supabase Auth guarda a credencial, faz o hash, manda os
 *     e-mails de confirmação e de redefinição e emite o JWT da sessão.
 *     É o provedor de produção.
 *   • local — o próprio banco guarda um hash scrypt e uma tabela de
 *     sessões. Serve para desenvolvimento e para o teste end-to-end rodar
 *     sem depender de rede.
 *
 * O resto do sistema NÃO sabe qual está ativo: o papel (CUSTOMER/ADMIN),
 * o perfil, os endereços e os pedidos continuam sendo desta aplicação, na
 * tabela `users`. O provedor só responde "quem é esta pessoa".
 */

export type IdentityRef = {
  /** Id da credencial no provedor. Vai para users.auth_user_id. */
  authId: string;
  email: string;
};

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  phone: string;
};

export type RegisterResult = {
  /**
   * Id da credencial, quando é o PROVEDOR que define a identidade
   * (o UUID do Supabase). Nulo quando é a aplicação que define — o caso do
   * provedor local, em que o id da linha de `users` é a identidade.
   */
  authId: string | null;
  /**
   * true quando o provedor exige confirmação por e-mail antes do primeiro
   * acesso. Nesse caso NÃO existe sessão aberta e a tela precisa avisar.
   */
  needsEmailConfirmation: boolean;
  /**
   * Hash da senha para a aplicação guardar — SOMENTE no provedor local.
   * Com o Supabase a senha nunca passa por este banco.
   */
  passwordHash?: string;
};

export interface IdentityProvider {
  readonly id: "supabase" | "local";
  readonly label: string;

  /** Tem tudo que precisa para funcionar (chaves, URL)? */
  isConfigured(): boolean;

  /**
   * Cria a credencial. NÃO toca na tabela `users` — quem grava a linha do
   * cliente (com endereço e telefone) é a rota de cadastro, depois desta
   * chamada. Assim, se a criação da credencial falhar, nenhum cadastro
   * pela metade fica no banco.
   */
  register(input: RegisterInput): Promise<RegisterResult>;

  /**
   * Abre a sessão de um usuário recém-cadastrado.
   *
   * Existe porque o provedor local precisa do id da linha de `users` para a
   * chave estrangeira da tabela de sessões, e esse id só existe depois do
   * `register`. No Supabase é inócuo: o `signUp` já entregou os cookies.
   */
  startSession(appUserId: string): Promise<void>;

  /** Confere a senha e abre a sessão (grava os cookies). */
  signIn(input: { email: string; password: string }): Promise<{ authId: string }>;

  /** Fecha a sessão deste aparelho. */
  signOut(): Promise<void>;

  /** Fecha a sessão em todos os aparelhos do usuário. */
  signOutEverywhere(authId: string): Promise<void>;

  /** Quem está na requisição atual, segundo o provedor. Nunca lança. */
  current(): Promise<IdentityRef | null>;

  /**
   * Dispara a redefinição de senha.
   *
   * Devolve `link` apenas quando é a própria aplicação que precisa entregar
   * a mensagem (provedor local). Com o Supabase o e-mail sai de lá e não há
   * link para devolver.
   */
  requestPasswordReset(input: { email: string; authId: string }): Promise<{ link?: string }>;

  /** Aplica a nova senha a partir do token/código recebido por e-mail. */
  resetPassword(input: { token: string; password: string }): Promise<{ authId: string }>;

  /** Troca a senha de quem está logado, conferindo a senha atual. */
  changePassword(input: {
    authId: string;
    email: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void>;

  /**
   * Mantém o e-mail da credencial em sincronia com o perfil.
   *
   * `applied: false` significa que o provedor exige confirmação no novo
   * endereço — o e-mail do perfil NÃO deve mudar ainda.
   */
  updateEmail(input: { authId: string; email: string }): Promise<{ applied: boolean }>;
}

/** Dados do usuário da aplicação que as telas e rotas usam. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  createdAt: Date;
};
