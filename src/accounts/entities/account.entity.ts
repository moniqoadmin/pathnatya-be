import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Team } from './team.entity';

export enum AccountRole {
  USER = 'User',
  ADMIN = 'Admin',
  SUPER_ADMIN = 'SuperAdmin',
  DEVELOPER = 'Developer',
}

const FIXED_SINGLE_TEAM_ROLES: ReadonlySet<AccountRole> = new Set([
  AccountRole.ADMIN,
  AccountRole.SUPER_ADMIN,
  AccountRole.DEVELOPER,
]);

// Case-insensitive match against the four roles. Unknown / empty → User.
export function parseAccountRole(raw: unknown): AccountRole {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase();
  const match = Object.values(AccountRole).find(
    (role) => role.toLowerCase() === normalized,
  );
  return match ?? AccountRole.USER;
}

/** Admin, SuperAdmin, and Developer always have one team on Excel create. */
export function hasFixedSingleTeamCount(role: AccountRole): boolean {
  return FIXED_SINGLE_TEAM_ROLES.has(role);
}

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 10-digit US/UK/India phone number, stored without country code or
  // extension (e.g. 9876543210). phoneNumber is immutable once created.
  @Column({ name: 'phone_number', unique: true, length: 20, update: false })
  phoneNumber: string;

  @Column({ name: 'is_offline', type: 'boolean', default: true })
  isOffline: boolean;

  @Column({
    type: 'enum',
    enum: AccountRole,
    default: AccountRole.USER,
  })
  role: AccountRole;

  @Column({ type: 'varchar', length: 120, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sanghat: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  jilha: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  taluka: string | null;

  @Column({ name: 'group', type: 'varchar', length: 120, nullable: true })
  group: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  kendra: string | null;

  @Column({
    name: 'sanchalak_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  sanchalakName: string | null;

  // Max number of team rows allowed for this account. Null is treated as 1.
  // Rows are created when a new device IP logs in, not when the account is.
  @Column({ name: 'number_of_teams', type: 'int', nullable: true })
  numberOfTeams: number | null;

  @Column({ name: 'number_of_reboot', type: 'int', default: 0 })
  numberOfReboot: number;

  // When true, the Electron app shows the logout button in the top bar.
  @Column({ name: 'logout_button', type: 'boolean', default: false })
  logoutButton: boolean;

  // ID of the app_configurations row assigned to this account.
  @Column({ name: 'app_configuration', type: 'int', default: 1 })
  appConfiguration: number;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @OneToMany(() => Team, (team) => team.account, { cascade: true })
  teams: Team[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
