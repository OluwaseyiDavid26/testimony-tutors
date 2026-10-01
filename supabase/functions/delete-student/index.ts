import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    const { data: caller, error: callerErr } = await supabaseAdmin
      .from("staff_accounts")
      .select("id, role, active")
      .eq("auth_user_id", userClaims.id)
      .single();

    if (callerErr || !caller || caller.role !== "admin" || caller.active === false) {
      return Response.json({ error: "Only admin can delete students." }, { status: 403 });
    }

    const { studentId } = await req.json();
    if (!studentId) {
      return Response.json({ error: "Missing studentId." }, { status: 400 });
    }

    const { data: student, error: findErr } = await supabaseAdmin
      .from("students").select("id, auth_user_id").eq("id", studentId).single();
    if (findErr || !student) {
      return Response.json({ error: "Student not found." }, { status: 404 });
    }

    const { error: delErr } = await supabaseAdmin
      .from("students").delete().eq("id", studentId);
    if (delErr) return Response.json({ error: delErr.message }, { status: 400 });

    if (student.auth_user_id) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(student.auth_user_id);
      if (authErr) {
        return Response.json({ error: "Row deleted, login removal failed: " + authErr.message }, { status: 500 });
      }
    }
    return Response.json({ success: true });
  })
};