import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    const { data: callerStaff, error: callerErr } = await supabaseAdmin
      .from("staff_accounts")
      .select("id, role")
      .eq("auth_user_id", userClaims.id)
      .single();

    if (callerErr || !callerStaff || callerStaff.role !== "admin") {
      return Response.json({ error: "Only admin can create staff accounts." }, { status: 403 });
    }

    const body = await req.json();
    const { name, branch, username, password } = body;

    if (!name || !username || !password) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("staff_accounts")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existing) {
      return Response.json({ error: "That username is already taken." }, { status: 400 });
    }

    const email = `${username.toLowerCase()}@staff.testimonytutorportal.app`;

    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createErr || !newUser?.user) {
      return Response.json({ error: createErr?.message || "Failed to create login." }, { status: 400 });
    }

    const { data: staffRow, error: insertErr } = await supabaseAdmin
      .from("staff_accounts")
      .insert({
        auth_user_id: newUser.user.id,
        username,
        name,
        role: "staff",
        branch: branch || null,
        active: true
      })
      .select()
      .single();

    if (insertErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return Response.json({ error: insertErr.message }, { status: 400 });
    }

    return Response.json({ staff: staffRow });
  })
};