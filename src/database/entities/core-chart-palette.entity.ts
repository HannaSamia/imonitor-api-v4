import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('core_chart_palette')
export class CoreChartPalette {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 20, nullable: false })
  color: string;
}
