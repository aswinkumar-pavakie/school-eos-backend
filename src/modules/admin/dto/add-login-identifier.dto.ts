import { IsIn, IsString, MinLength } from 'class-validator';

// Lets an existing person gain a second, independent way to log in (e.g. a
// guardian created with a MOBILE identifier who also gave a real email) --
// both identifiers resolve to the same person_id, so they share the one
// user_credential row and its one password. Never used to change which
// identifier is "the" login; both remain valid side by side.
export class AddLoginIdentifierDto {
  @IsIn(['EMAIL', 'MOBILE'])
  identifierType!: 'EMAIL' | 'MOBILE';

  @IsString()
  @MinLength(1)
  identifierValue!: string;
}
