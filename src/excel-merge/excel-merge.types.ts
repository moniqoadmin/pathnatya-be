export enum TaskColumnDataType {
  STRING = 'string',
  NUMBER = 'number',
  INTEGER = 'integer',
  PHONE = 'phone',
  DATE = 'date',
  BOOLEAN = 'boolean',
}

export enum MergeFileStatus {
  UPLOADED = 'uploaded',
  ANALYZED = 'analyzed',
  MAPPING_CONFIRMED = 'mapping_confirmed',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export enum MergeErrorStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
}

export type MappingAction = 'map' | 'ignore';

export type SavedColumnMapping = {
  sourceHeader: string;
  action: MappingAction;
  columnKey: string | null;
};

export type FileColumnMapping = {
  sourceHeader: string;
  sourceIndex: number;
  action: MappingAction;
  columnKey: string | null;
};

export type DetectedColumn = {
  index: number;
  header: string;
  sampleValues: string[];
  inferredType: TaskColumnDataType;
  emptyCount: number;
  filledCount: number;
};

export type SheetAnalysis = {
  name: string;
  headerRow: number | null;
  columnCount: number;
  dataRowCount: number;
  emptyRowCount: number;
  columns: DetectedColumn[];
  isLikelyDataSheet: boolean;
};

export type ExcelAnalysis = {
  sheets: SheetAnalysis[];
  selectedSheet: string | null;
  headerRow: number | null;
  columns: DetectedColumn[];
};

export type SummaryFilter = {
  column: string;
  equals: string | number | boolean;
};

export type SummaryMetric = {
  label: string;
  op: 'count' | 'sum';
  /** Number column to add. Required when op is sum. */
  column?: string;
  /** Rows must match every filter. A count with no filters counts every row in the group. */
  when?: SummaryFilter[];
};

/** Saved per task. rowColumn is each block, columnColumn is the headers inside it. */
export type TaskSummaryConfig = {
  rowColumn: string;
  columnColumn: string;
  totalLabel: string;
  metrics: SummaryMetric[];
};

export type FieldError = {
  columnKey: string;
  label: string;
  message: string;
  originalValue: unknown;
  currentValue: unknown;
};

export type SuggestedMapping = {
  sourceHeader: string;
  sourceIndex: number;
  action: MappingAction | 'unmapped';
  columnKey: string | null;
  columnLabel: string | null;
  reason: 'saved' | 'name_match' | 'unmapped';
};
