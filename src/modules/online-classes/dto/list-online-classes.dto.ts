import { IsIn } from 'class-validator';
import { OnlineClassView } from '../repositories/online-class.repository';

export class ListOnlineClassesDto {
  @IsIn(['upcoming', 'completed', 'cancelled'])
  view!: OnlineClassView;
}
