export type ExpenseRow = {
  id: string;
  kind: "EXPENSE" | "PAYOUT";
  status: "PENDING" | "APPROVED" | "REJECTED";
  title: string;
  description: string | null;
  amount: string;
  currency: string;
  amountBase: string;
  date: string;
  scope: "TEAM" | "PROJECT" | "MEMBER";
  projectId: string | null;
  memberId: string | null;
  tags: string[];
  createdById: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  project: { id: string; name: string } | null;
  member: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null } | null;
  approvedBy: { id: string; name: string | null } | null;
};

export type IncomeRow = {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  currency: string;
  amountBase: string;
  date: string;
  projectId: string | null;
  createdById: string | null;
  createdAt: string;
  project: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null } | null;
  _count: { distributions: number };
};

export type MemberRow = {
  id: string;
  name: string;
  position: string | null;
  active: boolean;
  userId: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null } | null;
  _count: { distributions: number; expenses: number };
};

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { members: number; incomes: number; expenses: number };
};

export type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  members: Array<{
    memberId: string;
    name: string;
    active: boolean;
    percent: string | null;
  }>;
};

export type DistributionRow = {
  id: string;
  memberId: string;
  incomeId: string | null;
  projectId: string | null;
  amountBase: string;
  percent: string | null;
  note: string | null;
  createdAt: string;
  member: { id: string; name: string };
  project: { id: string; name: string } | null;
  income: { id: string; title: string } | null;
};

export type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
};

export type Summary = {
  teamBalance: number;
  payable: number;
  monthIncome: number;
  monthExpense: number;
  members: Array<{ memberId: string; name: string; balance: number }>;
  projects: Array<{ projectId: string; name: string; balance: number }>;
  upcomingRecurring: Array<{
    id: string;
    title: string;
    amount: string;
    currency: string;
    nextRunAt: string;
    scope: "TEAM" | "PROJECT" | "MEMBER";
  }>;
};

export type UserOption = {
  id: string;
  email: string;
  name: string | null;
};
