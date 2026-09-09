// New table document_request (see database/migrations/0011_parent_module.sql,
// not yet run) -- Parent-side request/view only. Admin's own approve+upload
// screen is separate, later, out-of-scope work; once Admin approves and sets
// person_document_id, this repository's own list already resolves the real
// object_key needed for the signed download URL, no schema change needed
// then.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface DocumentRequestRow {
  id: string;
  docType: string;
  reason: string;
  state: string;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  documentObjectKey: string | null;
  documentFileName: string | null;
}

function mapRow(row: any): DocumentRequestRow {
  return {
    id: row.id,
    docType: row.doc_type,
    reason: row.reason,
    state: row.state,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    documentObjectKey: row.document_object_key,
    documentFileName: row.document_file_name,
  };
}

const REQUEST_WITH_DOCUMENT = `
  SELECT dr.id, dr.doc_type, dr.reason, dr.state, dr.decision_note, dr.decided_at, dr.created_at,
         pd.object_key AS document_object_key, pd.file_name AS document_file_name
  FROM document_request dr
  LEFT JOIN person_document pd ON pd.id = dr.person_document_id
`;

@Injectable()
export class ParentDocumentRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findForStudent(studentId: string, executor: Queryable = this.postgres): Promise<DocumentRequestRow[]> {
    const { rows } = await executor.query(
      `${REQUEST_WITH_DOCUMENT} WHERE dr.student_id = $1 ORDER BY dr.created_at DESC`,
      [studentId],
    );
    return rows.map(mapRow);
  }

  async findById(id: string, studentId: string, executor: Queryable = this.postgres): Promise<DocumentRequestRow | null> {
    const { rows } = await executor.query(`${REQUEST_WITH_DOCUMENT} WHERE dr.id = $1 AND dr.student_id = $2`, [id, studentId]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    input: { studentId: string; requestedBy: string; docType: string; reason: string },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO document_request (student_id, requested_by, doc_type, reason)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.studentId, input.requestedBy, input.docType, input.reason],
    );
    return rows[0].id;
  }
}
