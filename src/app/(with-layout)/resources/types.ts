import type { Kind } from "@/lib/resources";

export type TagRow = { id: string; name: string; color: string };

export type ResourceRow = {
  id: string;
  kind: Kind;
  name: string;
  ip: string;
  port: number | null;
  url: string;
  domain: string;
  note: string;
  /** Строкой, а не числом: Decimal в БД, и float потерял бы копейки. */
  amount: string;
  currency: string;
  isCrypto: boolean;
  chain: string;
  periodValue: number;
  periodUnit: string;
  /** "ГГГГ-ММ-ДД" — поле типа date, времени в нём нет. */
  nextPaymentAt: string;
  isActive: boolean;
  agentConnected: boolean;
  /** Сервер самой панели: мониторится изнутри, агент и ключи ему не нужны. */
  isSelf: boolean;
  /** Куда ходить по SSH. Пустой sshHost = использовать ip. */
  sshHost: string;
  sshPort: number;
  sshUser: string;
  /** Запомненный отпечаток хоста. Пусто — ещё не подключались. */
  sshFingerprint: string;
  provider: { id: string; name: string; url: string } | null;
  group: { id: string; name: string } | null;
  tags: TagRow[];
};

export type Catalog = {
  providers: Array<{ id: string; name: string; url: string }>;
  tags: TagRow[];
  groups: Array<{ id: string; name: string }>;
};
