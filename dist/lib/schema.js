"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.z = void 0;
exports.toInputSchema = toInputSchema;
exports.validateArgs = validateArgs;
const zod_1 = require("zod");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return zod_1.z; } });
/**
 * Convert a zod schema into the JSON Schema shape that MCP `tools/list` expects.
 * Uses zod 4's built-in `z.toJSONSchema`, then post-processes to match the
 * hand-written schema style we still have in legacy tool files: drop
 * `$schema`, remove `additionalProperties: false` recursively, and pull
 * default-valued fields out of `required` (zod 4 keeps them in `required`
 * because defaults satisfy the constraint, but the legacy schemas mark them
 * optional — Claude treats `required` as "must pass" so we mirror that).
 */
function toInputSchema(schema) {
    const json = zod_1.z.toJSONSchema(schema, { target: 'draft-7' });
    delete json.$schema;
    relaxJsonSchema(json);
    return json;
}
function relaxJsonSchema(node) {
    if (!node || typeof node !== 'object') {
        return;
    }
    if (node.type === 'object') {
        delete node.additionalProperties;
        const properties = node.properties || {};
        if (Array.isArray(node.required)) {
            node.required = node.required.filter((key) => {
                const prop = properties[key];
                return !prop || !Object.prototype.hasOwnProperty.call(prop, 'default');
            });
            if (node.required.length === 0) {
                delete node.required;
            }
        }
        for (const key of Object.keys(properties)) {
            relaxJsonSchema(properties[key]);
        }
    }
    else if (node.type === 'array' && node.items) {
        relaxJsonSchema(node.items);
    }
}
/**
 * Validate tool arguments with a zod schema. On success returns parsed args
 * (with defaults applied); on failure returns a ToolResponse error so callers
 * can early-return without throwing. The data is typed as `any` because most
 * call sites use a union schema looked up by tool name — preserving precise
 * inference there would require per-call generic narrowing that TS cannot do.
 */
function validateArgs(schema, args) {
    const parsed = schema.safeParse(args);
    if (parsed.success) {
        return { ok: true, data: parsed.data };
    }
    const issues = parsed.error.issues
        .map(i => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
    return {
        ok: false,
        response: { success: false, error: `Invalid arguments: ${issues}` },
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NoZW1hLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9zY2hlbWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBWUEsc0NBS0M7QUFpQ0Qsb0NBZUM7QUFqRUQsNkJBQXdCO0FBbUVmLGtGQW5FQSxPQUFDLE9BbUVBO0FBaEVWOzs7Ozs7OztHQVFHO0FBQ0gsU0FBZ0IsYUFBYSxDQUFDLE1BQXNCO0lBQ2hELE1BQU0sSUFBSSxHQUFRLE9BQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFDaEUsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3BCLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN0QixPQUFPLElBQUksQ0FBQztBQUNoQixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsSUFBUztJQUM5QixJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ3BDLE9BQU87SUFDWCxDQUFDO0lBQ0QsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDO1FBQ2pDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO1FBQ3pDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUMvQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBVyxFQUFFLEVBQUU7Z0JBQ2pELE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDN0IsT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDM0UsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUM3QixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7WUFDekIsQ0FBQztRQUNMLENBQUM7UUFDRCxLQUFLLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUN4QyxlQUFlLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDckMsQ0FBQztJQUNMLENBQUM7U0FBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM3QyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hDLENBQUM7QUFDTCxDQUFDO0FBRUQ7Ozs7OztHQU1HO0FBQ0gsU0FBZ0IsWUFBWSxDQUN4QixNQUFzQixFQUN0QixJQUFhO0lBRWIsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN0QyxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNqQixPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzNDLENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU07U0FDN0IsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1NBQ3pELElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNoQixPQUFPO1FBQ0gsRUFBRSxFQUFFLEtBQUs7UUFDVCxRQUFRLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxzQkFBc0IsTUFBTSxFQUFFLEVBQUU7S0FDdEUsQ0FBQztBQUNOLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcblxuLyoqXG4gKiBDb252ZXJ0IGEgem9kIHNjaGVtYSBpbnRvIHRoZSBKU09OIFNjaGVtYSBzaGFwZSB0aGF0IE1DUCBgdG9vbHMvbGlzdGAgZXhwZWN0cy5cbiAqIFVzZXMgem9kIDQncyBidWlsdC1pbiBgei50b0pTT05TY2hlbWFgLCB0aGVuIHBvc3QtcHJvY2Vzc2VzIHRvIG1hdGNoIHRoZVxuICogaGFuZC13cml0dGVuIHNjaGVtYSBzdHlsZSB3ZSBzdGlsbCBoYXZlIGluIGxlZ2FjeSB0b29sIGZpbGVzOiBkcm9wXG4gKiBgJHNjaGVtYWAsIHJlbW92ZSBgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlYCByZWN1cnNpdmVseSwgYW5kIHB1bGxcbiAqIGRlZmF1bHQtdmFsdWVkIGZpZWxkcyBvdXQgb2YgYHJlcXVpcmVkYCAoem9kIDQga2VlcHMgdGhlbSBpbiBgcmVxdWlyZWRgXG4gKiBiZWNhdXNlIGRlZmF1bHRzIHNhdGlzZnkgdGhlIGNvbnN0cmFpbnQsIGJ1dCB0aGUgbGVnYWN5IHNjaGVtYXMgbWFyayB0aGVtXG4gKiBvcHRpb25hbCDigJQgQ2xhdWRlIHRyZWF0cyBgcmVxdWlyZWRgIGFzIFwibXVzdCBwYXNzXCIgc28gd2UgbWlycm9yIHRoYXQpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9JbnB1dFNjaGVtYShzY2hlbWE6IHouWm9kVHlwZTxhbnk+KTogYW55IHtcbiAgICBjb25zdCBqc29uOiBhbnkgPSB6LnRvSlNPTlNjaGVtYShzY2hlbWEsIHsgdGFyZ2V0OiAnZHJhZnQtNycgfSk7XG4gICAgZGVsZXRlIGpzb24uJHNjaGVtYTtcbiAgICByZWxheEpzb25TY2hlbWEoanNvbik7XG4gICAgcmV0dXJuIGpzb247XG59XG5cbmZ1bmN0aW9uIHJlbGF4SnNvblNjaGVtYShub2RlOiBhbnkpOiB2b2lkIHtcbiAgICBpZiAoIW5vZGUgfHwgdHlwZW9mIG5vZGUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKG5vZGUudHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgZGVsZXRlIG5vZGUuYWRkaXRpb25hbFByb3BlcnRpZXM7XG4gICAgICAgIGNvbnN0IHByb3BlcnRpZXMgPSBub2RlLnByb3BlcnRpZXMgfHwge307XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5vZGUucmVxdWlyZWQpKSB7XG4gICAgICAgICAgICBub2RlLnJlcXVpcmVkID0gbm9kZS5yZXF1aXJlZC5maWx0ZXIoKGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJvcCA9IHByb3BlcnRpZXNba2V5XTtcbiAgICAgICAgICAgICAgICByZXR1cm4gIXByb3AgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwcm9wLCAnZGVmYXVsdCcpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAobm9kZS5yZXF1aXJlZC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgbm9kZS5yZXF1aXJlZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKSkge1xuICAgICAgICAgICAgcmVsYXhKc29uU2NoZW1hKHByb3BlcnRpZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG5vZGUudHlwZSA9PT0gJ2FycmF5JyAmJiBub2RlLml0ZW1zKSB7XG4gICAgICAgIHJlbGF4SnNvblNjaGVtYShub2RlLml0ZW1zKTtcbiAgICB9XG59XG5cbi8qKlxuICogVmFsaWRhdGUgdG9vbCBhcmd1bWVudHMgd2l0aCBhIHpvZCBzY2hlbWEuIE9uIHN1Y2Nlc3MgcmV0dXJucyBwYXJzZWQgYXJnc1xuICogKHdpdGggZGVmYXVsdHMgYXBwbGllZCk7IG9uIGZhaWx1cmUgcmV0dXJucyBhIFRvb2xSZXNwb25zZSBlcnJvciBzbyBjYWxsZXJzXG4gKiBjYW4gZWFybHktcmV0dXJuIHdpdGhvdXQgdGhyb3dpbmcuIFRoZSBkYXRhIGlzIHR5cGVkIGFzIGBhbnlgIGJlY2F1c2UgbW9zdFxuICogY2FsbCBzaXRlcyB1c2UgYSB1bmlvbiBzY2hlbWEgbG9va2VkIHVwIGJ5IHRvb2wgbmFtZSDigJQgcHJlc2VydmluZyBwcmVjaXNlXG4gKiBpbmZlcmVuY2UgdGhlcmUgd291bGQgcmVxdWlyZSBwZXItY2FsbCBnZW5lcmljIG5hcnJvd2luZyB0aGF0IFRTIGNhbm5vdCBkby5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlQXJncyhcbiAgICBzY2hlbWE6IHouWm9kVHlwZTxhbnk+LFxuICAgIGFyZ3M6IHVua25vd24sXG4pOiB7IG9rOiB0cnVlOyBkYXRhOiBhbnkgfSB8IHsgb2s6IGZhbHNlOyByZXNwb25zZTogVG9vbFJlc3BvbnNlIH0ge1xuICAgIGNvbnN0IHBhcnNlZCA9IHNjaGVtYS5zYWZlUGFyc2UoYXJncyk7XG4gICAgaWYgKHBhcnNlZC5zdWNjZXNzKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBwYXJzZWQuZGF0YSB9O1xuICAgIH1cbiAgICBjb25zdCBpc3N1ZXMgPSBwYXJzZWQuZXJyb3IuaXNzdWVzXG4gICAgICAgIC5tYXAoaSA9PiBgJHtpLnBhdGguam9pbignLicpIHx8ICc8cm9vdD4nfTogJHtpLm1lc3NhZ2V9YClcbiAgICAgICAgLmpvaW4oJzsgJyk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICByZXNwb25zZTogeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBJbnZhbGlkIGFyZ3VtZW50czogJHtpc3N1ZXN9YCB9LFxuICAgIH07XG59XG5cbmV4cG9ydCB7IHogfTtcbiJdfQ==