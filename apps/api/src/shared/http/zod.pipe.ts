import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/** Validates & coerces request input with a Zod schema (shared with the frontend). */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _meta: ArgumentMetadata): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
