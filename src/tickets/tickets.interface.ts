import { TicketCategory, TicketStatus, TicketType } from 'db/models/Ticket';

export interface newTicketDto {
  type: TicketType;
  companyId: number;
}

export interface TicketDto {
  id: number;
  type: TicketType;
  companyId: number;
  assigneeId: number;
  status: TicketStatus;
  category: TicketCategory;
}
