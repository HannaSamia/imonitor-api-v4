import { ApiProperty } from '@nestjs/swagger';

export class TabularHeaderDto {
  @ApiProperty({ description: 'Column display text' })
  text: string;

  @ApiProperty({ description: 'Column data field name' })
  datafield: string;

  @ApiProperty({ description: 'Column name' })
  columnName: string;

  @ApiProperty({ description: 'Aggregates array', type: [String] })
  aggregates: string[];

  @ApiProperty({ description: 'Whether column is pinned' })
  pinned: boolean;

  @ApiProperty({ description: 'Whether column is hidden' })
  hidden: boolean;

  @ApiProperty({ description: 'Whether column is editable' })
  editable: boolean;

  @ApiProperty({ description: 'Column type (e.g. alpha, number, datetime)' })
  columntype: string;
}

export class AuditLogsTableResponseDto {
  @ApiProperty({ type: [TabularHeaderDto], description: 'Table header columns' })
  header: TabularHeaderDto[];

  @ApiProperty({ description: 'Table body rows', type: [Object] })
  body: Record<string, unknown>[];
}
